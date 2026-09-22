# qubeex-app (React Native / Expo)

## Android text/element alignment

Android consistently renders text vertical alignment differently from iOS in
this app — labels, icons-next-to-text, and stacked Text elements often sit a
few px higher/lower than they do on iOS, and the gap between stacked Text
elements (e.g. name + roll no) is visibly larger on Android due to
`includeFontPadding` adding extra space above/below glyphs by default.

This is a recurring, per-element problem — there's no single global fix.
When building or touching any UI with text (buttons with icon+label, stacked
labels, badges, status pills, etc.), proactively check and fix Android
alignment rather than waiting for it to be reported:

- Add `includeFontPadding: false` to Text elements, especially when stacked
  tightly or centered inside a fixed-height container.
- Use explicit `lineHeight` on tightly stacked Text pairs instead of relying
  on default line height.
- For TextInput inside a fixed-height box, `textAlignVertical="center"` +
  `includeFontPadding={false}` sometimes still isn't enough with a custom
  font (Poppins here) — a fixed `height` fighting the font's own vertical
  metrics is the actual culprit. When that combo still clips/misrenders on
  Android, drop the fixed `height` entirely and size the box naturally via
  `paddingVertical` instead (tighter paddingVertical on Android than iOS if
  needed to roughly match visual size) — this is the more reliable fix, try
  it first for any TextInput that still looks wrong after the
  textAlignVertical+includeFontPadding fix.
- Small vertical offsets (e.g. `marginTop: Platform.OS === 'android' ? 2 : 0`,
  or a negative marginTop to shift an icon up) are sometimes still needed
  even after the above, for single-glyph labels (like P/A/L status buttons)
  or icons centered in a small fixed box/row.

This app has hit this same class of bug repeatedly across many different
elements (status pill labels, nav icons, stacked name/roll text, day-level
remark input, per-student remark input, etc.) — each one needed its own
individual fix, none of them shared by a global style. Expect this pattern
to keep showing up in new UI and check for it proactively instead of
waiting for it to be reported element-by-element.

Goal going forward: new UI should be built with Android alignment in mind
from the start, not fixed reactively element-by-element after the user
reports each one.

## Android nested horizontal ScrollView (teacher_class_detail.tsx)

The teacher class-detail screen's top-level tabs (View/Manage/Attendance/…)
are a horizontal, paging `ScrollView` (`tabPagerRef`, `pagingEnabled`) — the
whole tab content lives inside it. Any horizontal-scrolling content built
*inside* one of those tabs (e.g. the Attendance Sheet's wide grid, its month
chip row) is a horizontal ScrollView nested inside that horizontal pager.

On Android specifically, swiping on that inner horizontal content was
captured by the outer tab pager instead (the page would swipe to the next
tab rather than the inner content scrolling) — iOS didn't have this problem.
Fix: add `nestedScrollEnabled` to the inner horizontal ScrollView. Do this
proactively for any new horizontal-scrolling element added inside a tab on
this screen, not just after it's reported broken on Android.
