import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Modal, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, CreativeReference } from "../lib/api";
import { Btn } from "../components/Btn";
import { RemoteImage } from "../components/RemoteImage";
import { C, S } from "../lib/theme";

type Filter = "pending" | "accepted" | "benchmark" | "rejected" | "all";
export default function ReferencesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<CreativeReference[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CreativeReference | null>(null);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<CreativeReference["role"]>("exemplar");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  async function load() {
    setLoading(true); setError(null);
    try { setItems((await api.references()).references); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useFocusEffect(useCallback(() => { void load(); }, []));
  function open(item: CreativeReference) {
    setSelected(item); setTitle(item.title); setNotes(item.user_notes); setRole(item.role); setSaveError(null);
  }
  async function save(patch: Partial<CreativeReference> = {}) {
    if (!selected) return;
    setBusy(true); setSaveError(null);
    try {
      const { reference } = await api.updateReference(selected.id, {title, user_notes: notes, role, ...patch});
      setItems(current => current.map(item => item.id === reference.id ? reference : item));
      setSelected(null);
    } catch (e: any) { setSaveError(e.message); }
    finally { setBusy(false); }
  }
  const visible = items.filter(item =>
    (filter === "all" || (filter === "benchmark" ? item.benchmark : item.review_status === filter)) &&
    (kind === "all" || (kind === "near_miss" ? item.role === "near_miss" : item.source_type === kind)) &&
    `${item.title} ${item.tags.join(" ")} ${item.user_notes} ${item.rationale}`.toLowerCase().includes(search.toLowerCase())
  );
  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <Text style={S.h1}>References</Text>
      <Text style={S.body}>{items.filter(x => x.review_status === "accepted").length} accepted · {items.filter(x => x.benchmark).length} benchmark</Text>
      <View style={{flex:1}} />
      <Btn label="Add from Library" onPress={() => router.push("/library")} small />
      <Btn label="Refresh" onPress={load} loading={loading} small variant="ghost" />
    </View>
    <View style={styles.intro}>
      <Text style={S.h2}>Teach Glance what works.</Text>
      <Text style={styles.copy}>Review the suggested examples, keep what fits, and correct what doesn’t. Accepting a near miss means keeping it as an example of what to avoid.</Text>
      <Text style={styles.copy}>Accepted examples and your feedback now guide new images and captions. Benchmark items are held out from generation. Generated candidates still need your review before publishing.</Text>
    </View>
    <View style={styles.filters}>
      {(["pending", "accepted", "benchmark", "rejected", "all"] as Filter[]).map(value => <Btn key={value} label={value === "pending" ? `To review (${items.filter(x => x.review_status === "pending").length})` : value[0].toUpperCase()+value.slice(1)} onPress={() => setFilter(value)} small variant={filter === value ? "primary" : "ghost"} />)}
      <View style={{flex:1}} />
      <TextInput accessibilityLabel="Search references" placeholder="Search notes or themes…" placeholderTextColor={C.textMuted} value={search} onChangeText={setSearch} style={[styles.input,{minWidth:210}]} />
    </View>
    <View style={styles.filters}>
      {[['all','All types'],['post','Finished posts'],['background','Backgrounds'],['near_miss','Near misses']].map(([value,label]) => <Btn key={value} label={label} onPress={() => setKind(value)} small variant={kind === value ? "outline" : "ghost"} />)}
    </View>
    {error && <Text style={styles.error}>{error}</Text>}
    {loading && !items.length ? <ActivityIndicator color={C.accent} style={{margin:40}} /> :
    <ScrollView contentContainerStyle={styles.grid}>
      {visible.map(item => <Pressable key={item.id} accessibilityLabel={`Review ${item.title}`} onPress={() => open(item)} style={styles.card}>
        <View style={styles.image}><RemoteImage uri={item.publicUrl} width={480} style={styles.fill} resizeMode="contain" /></View>
        <View style={styles.cardBody}>
          <Text style={styles.meta}>{item.source_type === "background" ? "BACKGROUND" : "FINISHED POST"} · {item.role === "near_miss" ? "NEAR MISS" : "EXAMPLE"}</Text>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.copy} numberOfLines={3}>{item.user_notes || item.rationale || "Add a note about what works and what you would change."}</Text>
          <Text style={styles.attribution}>{item.review_status === "pending" ? item.suggested_by === "assistant" ? "Suggested by assistant · needs your review" : "Added by you · awaiting review" : `${item.review_status === "accepted" ? "Accepted by you" : "Rejected by you"}${item.benchmark ? " · Benchmark" : ""}`}</Text>
        </View>
      </Pressable>)}
      {!visible.length && <View style={styles.empty}><Text style={S.h2}>No references here yet.</Text><Text style={styles.copy}>{filter === "benchmark" ? "Accept a reference, then add it to the benchmark from its review panel." : "Try another filter or add selected posts from Library."}</Text></View>}
    </ScrollView>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => !busy && setSelected(null)}>
      <View style={styles.overlay}><View style={styles.dialog}>
        <View style={styles.toolbar}><Text style={S.h2}>Review reference</Text><View style={{flex:1}} /><Btn label="Close" onPress={() => setSelected(null)} disabled={busy} small variant="ghost" /></View>
        {selected && <ScrollView contentContainerStyle={styles.review}>
          <View style={styles.reviewImage}><RemoteImage uri={selected.publicUrl} width={1000} style={styles.fill} resizeMode="contain" /></View>
          <View style={styles.reviewText}>
            <Text style={styles.meta}>{selected.suggested_by === "assistant" ? "ASSISTANT SUGGESTION — YOUR REVIEW COMES FIRST" : "ADDED FROM YOUR LIBRARY"}</Text>
            <Text style={S.label}>Reference title</Text>
            <TextInput value={title} onChangeText={setTitle} maxLength={160} accessibilityLabel="Reference title" style={styles.input} />
            {[["Why this example",selected.rationale],["Preserve",selected.preserve],["Free to vary",selected.vary],["Watch out for",selected.caution]].filter(([,value]) => value).map(([label,value]) => <View key={label} style={{gap:5}}><Text style={S.label}>{label}</Text><Text style={styles.detailCopy}>{value}</Text></View>)}
            {!!selected.tags.length && <Text style={styles.copy}>{selected.tags.join(" · ")}</Text>}
            <View style={styles.actions}><Btn label="Positive example" onPress={() => setRole("exemplar")} small variant={role === "exemplar" ? "primary" : "outline"} /><Btn label="Near miss / avoid" onPress={() => setRole("near_miss")} small variant={role === "near_miss" ? "primary" : "outline"} /></View>
            <Text style={S.label}>Your feedback</Text>
            <TextInput accessibilityLabel="Your feedback" value={notes} onChangeText={setNotes} multiline maxLength={3000} placeholder="What should we keep? What feels wrong? Your correction overrides the suggestion." placeholderTextColor={C.textMuted} style={[styles.input,{minHeight:105,textAlignVertical:"top"}]} />
            {saveError && <Text style={styles.error}>{saveError}</Text>}
            <View style={styles.actions}>
              <Btn label="Accept reference" onPress={() => save({review_status:"accepted"})} loading={busy} />
              <Btn label="Save feedback" onPress={() => save()} disabled={busy} variant="outline" />
              <Btn label="Reject suggestion" onPress={() => save({review_status:"rejected"})} disabled={busy} variant="ghost" />
            </View>
            {selected.review_status === "accepted" && <Btn label={selected.benchmark ? "Remove from benchmark" : "Add to benchmark"} onPress={() => save({benchmark:!selected.benchmark})} disabled={busy} variant="outline" />}
            {selected.review_status !== "pending" && <Btn label="Return to review" onPress={() => save({review_status:"pending"})} disabled={busy} variant="ghost" />}
          </View>
        </ScrollView>}
      </View></View>
    </Modal>
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg}, toolbar:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10,padding:20,borderBottomWidth:1,borderBottomColor:C.border},
  intro:{padding:20,gap:8,maxWidth:900}, copy:{color:C.textSecondary,fontSize:13,lineHeight:20}, detailCopy:{color:C.textPrimary,fontSize:14,lineHeight:21},
  filters:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:8,paddingHorizontal:20,paddingBottom:12},
  grid:{padding:20,gap:16,flexDirection:"row",flexWrap:"wrap"},card:{width:280,maxWidth:"100%",borderRadius:12,overflow:"hidden",borderWidth:1,borderColor:C.border,backgroundColor:C.surface},image:{width:"100%",aspectRatio:1},fill:{width:"100%",height:"100%"},cardBody:{padding:14,gap:8},title:{color:C.textPrimary,fontSize:15,fontWeight:"600"},meta:{color:C.accentDim,fontSize:10,fontWeight:"700",letterSpacing:0.5},attribution:{color:C.textSecondary,fontSize:11,lineHeight:16},input:{color:C.textPrimary,backgroundColor:C.surfaceHigh,padding:12,borderWidth:1,borderColor:C.border,borderRadius:8,fontSize:13},error:{color:C.danger,padding:12},empty:{padding:20,gap:10},overlay:{flex:1,backgroundColor:"rgba(0,0,0,0.8)",justifyContent:"center",alignItems:"center",padding:16},dialog:{width:"100%",maxWidth:1100,maxHeight:"94%",backgroundColor:C.bg,borderWidth:1,borderColor:C.border,borderRadius:14,overflow:"hidden"},review:{padding:20,gap:24,flexDirection:"row",flexWrap:"wrap"},reviewImage:{width:420,maxWidth:"100%",aspectRatio:1},reviewText:{flex:1,minWidth:240,gap:12},actions:{flexDirection:"row",flexWrap:"wrap",gap:8},
});
