"""Run lifecycle/regression SQL in disposable PostgreSQL; never read .env."""
from pathlib import Path
import subprocess
import time
import uuid

root = Path(__file__).resolve().parents[2]
container = "glance-assets-test-" + uuid.uuid4().hex[:10]
migrations = [
    "20250310000000_initial.sql", "20260610000000_add_post_status.sql",
    "20260611000000_add_drafts_and_prompts.sql", "20260614000000_add_backgrounds_and_caption_options.sql",
    "20260614010000_add_medium_widget_posts.sql", "20260615000000_add_instagram_carousels.sql",
    "20260618000000_add_staged_backgrounds.sql", "20261006000000_add_creative_references.sql",
    "20261007000000_add_generation_feedback.sql", "20261007010000_add_widget_eligibility.sql",
    "20261007020000_add_generation_history.sql", "20261009000000_cloud_instagram_schedule.sql",
    "20261009020000_carousel_suggestions.sql", "20261009030000_carousel_cover_history.sql",
    "20261009040000_fifo_carousel_queue.sql",
]


def sql(source):
    result = subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
                            input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)


subprocess.run(["docker", "run", "--rm", "-d", "--name", container,
                "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15"], check=True, capture_output=True)
try:
    for _ in range(60):
        ready = subprocess.run(["docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], capture_output=True)
        if ready.returncode == 0:
            break
        time.sleep(.25)
    else:
        raise RuntimeError("Isolated PostgreSQL did not start")
    sql("create role anon; create role authenticated; create role service_role;\n" +
        "\n".join((root / "supabase/migrations" / name).read_text() for name in migrations))
    # Existing retained rows must be protected by the backfill as well as triggers.
    sql("insert into backgrounds(name,storage_path,status) values('backfill-fixture','drafts/backgrounds/retained.png','discarded');")
    sql((root / "supabase/migrations/20261013000000_image_asset_lifecycle.sql").read_text())
    sql("do $$ begin assert exists(select 1 from image_asset_references where storage_path='drafts/backgrounds/retained.png'); end $$;")
    for name in ["backend/tests/image-assets.integration.sql", "backend/tests/generation-feedback.integration.sql",
                 "backend/tests/generation-history.integration.sql", "backend/tests/widget-eligibility.integration.sql",
                 "supabase/tests/carousel_queue_order.sql"]:
        sql((root / name).read_text())
        print("PASS", name)
    sql("insert into posts(instagram_id,storage_path,status) select 'cover-fixture-'||n,'drafts/captioned/cover-'||n||'.png','active' from generate_series(1,5) n;")
    sql((root / "supabase/tests/carousel_cover_history.sql").read_text())
    print("PASS supabase/tests/carousel_cover_history.sql (shared draft paths)")
finally:
    subprocess.run(["docker", "stop", container], check=True, capture_output=True)
