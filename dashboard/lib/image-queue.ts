// Bound requests across all mounted thumbnails, including retries.
export function createImageQueue(limit = 3) {
  let active = 0;
  const waiting: Array<() => void> = [];
  function drain() {
    while (active < limit && waiting.length) waiting.shift()!();
  }
  return function enqueue(start: (release: () => void) => void) {
    let running = false;
    let finished = false;
    function release() {
      if (finished) return;
      finished = true;
      if (running) active--;
      const index = waiting.indexOf(run);
      if (index >= 0) waiting.splice(index, 1);
      drain();
    }
    function run() {
      running = true;
      active++;
      start(release);
    }
    waiting.push(run);
    drain();
    return release;
  };
}

export const enqueueImage = createImageQueue();
