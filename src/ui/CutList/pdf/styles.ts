import { StyleSheet } from '@react-pdf/renderer';

/**
 * Shared look for the cut-list PDF. The diagram palette mirrors the on-screen
 * "shop document" SVG (`.sheet-*` rules in styles.css) so the printed page reads
 * the same as the editor. react-pdf has no CSS classes, so what lived in the
 * stylesheet here lives as plain constants the diagram passes as props.
 */
export const C = {
  ink: '#2a241b',
  ink2: '#4a3d28',
  line: '#a39b8b',
  sheetBg: '#fbf8f1',
  part: '#d8b886',
  partStroke: '#6b5634',
  trim: '#d6cdb8',
  dim: '#35597f',
  dimText: '#28425e',
  cut: '#b3402e',
  paper: '#ffffff',
  faint: '#7a7163',
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.ink,
  },

  // Cover
  coverTitle: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: C.ink },
  coverSub: { fontSize: 11, color: C.faint, marginTop: 4 },
  statsRow: { flexDirection: 'row', marginTop: 24, marginBottom: 8 },
  stat: { marginRight: 36 },
  statNum: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.partStroke },
  statLabel: { fontSize: 9, color: C.faint, marginTop: 2 },
  note: { fontSize: 9, color: C.ink2, marginTop: 10, lineHeight: 1.4 },
  warn: { fontSize: 9, color: C.cut, marginTop: 10, lineHeight: 1.4 },

  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 6, marginTop: 16 },

  // Per-sheet page
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  sheetTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.ink },
  sheetMeta: { fontSize: 9, color: C.faint },
  sheetBody: { flexDirection: 'row' },
  diagramCol: { width: 250, marginRight: 16 },
  infoCol: { flex: 1 },

  // Tables
  table: { marginTop: 2 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.line },
  trHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.partStroke, paddingBottom: 2 },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink2, paddingVertical: 2, paddingRight: 3 },
  td: { fontSize: 8, color: C.ink, paddingVertical: 2, paddingRight: 3 },
  mono: { fontFamily: 'Helvetica-Bold', color: C.partStroke },

  // Cut sequence
  cutsTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 3 },
  cutRow: { flexDirection: 'row', marginBottom: 2, alignItems: 'flex-start' },
  cutNum: {
    width: 13, height: 13, borderRadius: 6.5, backgroundColor: C.cut, color: '#fff',
    fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 3, marginRight: 5,
  },
  cutText: { flex: 1, fontSize: 8, color: C.ink2, lineHeight: 1.35 },

  footer: {
    position: 'absolute', bottom: 22, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7.5, color: C.faint,
  },
});
