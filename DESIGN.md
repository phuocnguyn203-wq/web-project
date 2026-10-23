---
name: LectureCards
description: Vietnamese lectures turned into a daily tear-off review, one calendar sheet a day.
colors:
  lich-red: "#c8102e"
  lich-red-deep: "#a00d25"
  lich-red-soft: "#fbe9ec"
  ink: "#121a2c"
  ink-raised: "#1d2740"
  ink-2: "#3f4759"
  ink-3: "#5f6678"
  paper: "#fdfdfb"
  sheet-white: "#ffffff"
  panel: "#f3f4f7"
  rule: "#e2e4ea"
  done-green: "#1d7349"
  done-green-soft: "#e6f3ec"
typography:
  numeral-hero:
    fontFamily: "Barlow Condensed, Be Vietnam Pro, sans-serif"
    fontSize: "9.5rem"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  numeral-inline:
    fontFamily: "Barlow Condensed, Be Vietnam Pro, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
    fontFeature: "\"ss01\", \"tnum\""
  sheet-head:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.16em"
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.lich-red}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.lich-red-deep}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-ink-hover:
    backgroundColor: "{colors.ink-raised}"
  button-ghost:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    textColor: "{colors.lich-red}"
    rounded: "{rounded.md}"
  button-danger-hover:
    backgroundColor: "{colors.lich-red-soft}"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  tear-sheet:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.lg}"
    padding: "16px 24px 24px"
  teacher-rail:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
    width: "264px"
---

# Design System: LectureCards

## Overview

**Creative North Star: "The Lịch Blốc"**

The app is a Vietnamese tear-off wall calendar. Each day the student gets one sheet: a weekday line under a double rule, one huge red numeral for the cards due, and a single red button. Rating a card tears that sheet off the block and shows the next one. Teachers work in the same paper-and-ink world, with an ink-navy rail for classes and a quiet table of lectures moving through the pipeline.

The ground is crisp paper white, not cream. Text is blue-black ink. Lịch red is the calendar's "today" red, and it marks what is due, current, or wrong. Rank comes from weight and case, not from size jumps: tracked uppercase sheet heads, bold titles, and regular body text, all in Be Vietnam Pro. The only big type is the condensed numeral, which carries the calendar's date or the count of cards due.

Interfaces are dense where teachers need them, on laptops, and calm on phones, where students review in short sessions. Depth is physical: a sheet sits on a block of sheets, and nothing else floats.

**Key Characteristics:**
- Paper white ground, blue-black ink, lịch red as the single signal color.
- Double hairline sheet rule under every page or sheet head.
- Perforated top edge on calendar sheets, plus the logo mark.
- Barlow Condensed bold for calendar numerals only; Be Vietnam Pro for everything else.
- Tear-off motion when a review card is rated.

## Colors

A one-accent calendar palette: ink on paper, with red for "today" and green for "done".

### Primary
- **Lịch Red** (lich-red): the due-count numeral, the primary action ("Bắt đầu ôn", "Tải bài giảng"), the active tab underline, the running pipeline step, source timestamps, the "đã sửa" pen mark, text selection, the input caret, and error text.
- **Lịch Red Deep** (lich-red-deep): hover state for red buttons, and text on the red-soft error note.
- **Lịch Red Soft** (lich-red-soft): background wash for error notes, destructive hovers, and the "Quên" grade hover.

### Secondary
- **Done Green** (done-green): completion only. The finished-day sheet header and numeral, the "Sẵn sàng" and "Đã giao cho lớp" states, correct quiz answers, and the "Dễ" grade.
- **Done Green Soft** (done-green-soft): wash behind correct answers and the "Dễ" hover.

### Neutral
- **Blue-Black Ink** (ink): body text, the sheet header band, the double rule, ink buttons, and the teacher rail background.
- **Raised Ink** (ink-raised): hover state for ink buttons.
- **Ink 2** (ink-2): secondary text, form labels, and long-form summary text.
- **Ink 3** (ink-3): the lunar-date line. Metadata, dates, placeholders, table heads, and idle icons.
- **Paper** (paper): page ground and theme color.
- **Sheet White** (sheet-white): sheets, cards, inputs, and tables sitting on the paper.
- **Panel** (panel): skeletons, count badges, icon-button hover, and the login backdrop.
- **Rule** (rule): every single hairline, including borders, dividers, idle pipeline steps, and the scrollbar.

### Named Rules
**The Today Red Rule.** Red means due, today, current, or wrong. Do not use it for decoration, and do not use it for success.

**The Green Is Done Rule.** Green appears only once something is finished or correct. A day with nothing left to review turns its sheet green.

## Typography

**Display Font:** Barlow Condensed (fallback Be Vietnam Pro, sans-serif), weights 600 and 700
**Body Font:** Be Vietnam Pro (fallback system-ui, sans-serif), weights 400 to 700
Both are loaded with the Vietnamese subset.

**Character:** A tall condensed calendar numeral sits over a warm, legible Vietnamese grotesque. The numeral is the date on the wall, and the grotesque is everything else.

### Hierarchy
- **Numeral Hero** (700, 8rem to 13rem, 0.9 to 0.95 line height, -0.03em tracking, tabular): the due count (9.5rem), the done count (8rem), and the login date (13rem). One per screen.
- **Numeral Inline** (700, 1.25rem, tabular): counts inside a sentence ("Còn **6** tờ", "Đúng **4**/5 câu").
- **Headline** (700, 28px, tight leading, -0.025em): page titles such as class or lecture names. Drops to 24px on mobile for the student lecture page.
- **Title** (700, 15px): section titles inside a page. Summary `##` headings use the same size in uppercase with wide tracking.
- **Body** (400, 15px, 1.75 line height, max 68ch): summaries and explanatory copy. Lists and tables use 14px.
- **Sheet Head** (700, 12 to 13px, uppercase, 0.12em to 0.18em tracking): the date line on a sheet and table column heads (0.08em). Never as an eyebrow over a heading: a class name over its lecture list is a 15px semibold sentence-case heading.
- **Label** (600, 13px): form labels, status text, and timestamps.

### Named Rules
**The Weight Not Size Rule.** Rank is carried by weight and case on a tight scale (12, 13, 15, 28px). Do not add intermediate display sizes. The numeral is the only exception.

**The Numerals Only Rule.** Barlow Condensed sets numbers only: dates, counts, and scores. Never use it for words. The single exception is the one-letter logo mark.

**The Tabular Rule.** Every number is tabular (`tnum` is on globally) so counts and dates line up.

## Layout

The student surface is a centered column up to 1024px (`max-w-5xl`) under a 56px sticky paper header with a hairline and a light blur. On desktop, home is two columns: the 400px tear sheet pinned on the left (sticky at 96px), and classes on the right with a 56px gap. The review screen narrows to a 576px column. On mobile everything stacks, and bottom padding respects the safe area.

The teacher surface is a 264px ink rail beside a fluid main area (padding 20px, then 40px). Content caps at 1152px. On mobile the rail collapses into a top bar with classes in a horizontal scroll strip.

Spacing uses a 4px base. Recurring steps are 8, 12, 16, 24, and 40px. Lists are hairline-divided rows with about 14px vertical padding, not stacked cards.

**The Sheet Head Rule.** Every page and every sheet opens with its title over a 3px double ink rule (`border-bottom: 3px double`). This is the calendar sheet head, and it replaces boxed headers.

## Elevation & Depth

Depth is physical and comes from the calendar only. Pages, tables, and forms are flat, separated by hairlines. Only calendar sheets lift: a sheet casts one long, soft ink-tinted shadow, and one or two blank sheets peek out under it (offset 4 to 12px, inset 6 to 16px), so the screen reads as a block of pages. The review block shows as many under-sheets as cards remain, up to two.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 14px 36px -16px rgba(18,26,44,0.3)`): the top sheet of a calendar block.
- **Under-sheet** (`box-shadow: 0 1px 2px rgba(18,26,44,0.08 to 0.12)`): the blank sheets stacked under it.
- **Binding** (`box-shadow: 0 2px 4px rgba(18,26,44,0.25)`): the ink binding bar on the login calendar.
- **Field focus** (`box-shadow: 0 0 0 3px rgba(18,26,44,0.08)`): a soft ink halo on focused inputs.

### Named Rules
**The Only Sheets Lift Rule.** If it isn't a calendar sheet, it doesn't get a shadow. Cards, tables, and panels use a hairline.

## Shapes

Corners are gently rounded: 6px (`rounded-md`) on buttons, inputs, and notes, and 8px on tables and empty states. Calendar sheets are rounded only at the bottom (8px). Their top is a straight 10px colored header band (ink, red on the answer side, green when done) cut by the perforation. The perforation is a CSS mask of 7px half-holes repeating every 16px along the top edge, and it is used on calendar sheets and the logo mark only. Pipeline steps are 6px-tall pill bars. Empty states use a dashed hairline border.

## Components

### Buttons
Short, solid, and pressable.
- **Shape:** gently rounded (6px). Sizes are 32, 40, and 48px tall, with 12, 16, and 24px side padding at 13, 14, and 15px semibold.
- **Primary (red):** the single most important action on a screen.
- **Ink:** secondary commits such as "Tham gia", "Về trang chủ", and save.
- **Ghost:** white with a hairline border, and the border darkens to ink-3 on hover.
- **Danger:** red text, with a red-soft wash on hover.
- **Press:** every pressable scales to 0.97 on `:active` (140ms ease-out), and colors cross-fade over 160ms. Disabled buttons drop to 50% opacity. Loading shows a spinner and disables the button.

### Inputs / Fields
- **Style:** white, hairline border, 6px radius, 40px tall, 15px text, ink-3 placeholder, red caret.
- **Focus:** the border turns ink and a 3px ink halo appears at 8% opacity. Hover darkens the border to ink-3.
- **Label / hint / error:** label 13px semibold ink-2 above. Below the field, either a 13px ink-3 hint or a 13px red error.
- **On ink:** white at 5% fill, white at 15% border, and the border goes solid white on focus.

### Tabs
Underline tabs over a hairline. The active tab is ink text with a 2px red underline. Idle tabs are ink-3. Counts appear in a small panel badge.

### Navigation
- **Student:** a sticky paper header with the logo, the user name, and an icon-only logout button.
- **Teacher:** an ink rail with an uppercase "Lớp học" sheet head and a list of classes. The active class is a white pill with ink text. Idle classes are 80% white and get an 8% white hover. Lecture counts sit to the right in tabular figures.

### Calendar Sheet (signature)
A white sheet with a 10px ink header band and a perforated top, a sheet head (date line over the double rule), and its content. On review, the card flips in 3D (420ms, ease-out) to its back face, which has a red header band. Rating tears the sheet off: it translates to 18% / -110% and rotates 9deg from the top-left corner over 420ms on `cubic-bezier(0.32, 0.72, 0, 1)` while fading out, revealing the real next card, which is already rendered underneath as the top of the block. Only the first card of a session rises 6px into place (260ms). The blank sheet edges under the block number min(ceil((left−2)/3), 4), so the block thins as you review. With reduced motion, the tear becomes a 160ms fade, and rise and flip become instant. The four grade buttons (Quên, Khó, Nhớ, Dễ) sit under the sheet. They are dimmed until the card is flipped, and their color matches what they mean: red for forgot, green for easy, and ink for the two in between.

### Pipeline
Four pill bars, one per processing step. Done steps are ink, the current step is red and pulsing, and pending steps are rule-colored. Under the bars is the step name with an ink-3 percentage. When the lecture is ready, the label turns green with a check icon.

### Lists and Tables
Rows are separated by hairlines. Lists have no container. Card lists (teacher review and student study) are ruled rows: a red source column (timestamp or "Trang N"), the question in semibold, and the answer below. Students tap the row to reveal the answer in place, under a 1px rule. Below `sm`, tables become stacked ruled rows. Tables sit in a white 8px-rounded box with a hairline border and an uppercase ink-3 head row. Hovering a row tints it with panel and underlines its title.

### Illustration and Ambient Motion
All art lives in `components/art.tsx` and is drawn in the sheet's own vocabulary: paper fills, rule or ink-3 hairlines, an ink header band, and one red accent. No stock photos, gradients, or emoji.
- **Login demo:** the calendar block tears its top sheet every 4.2s (the same `.tearing` motion). Today's date gives way to three sample flashcards labelled "Thẻ ví dụ", and the loop pauses while the tab is hidden. Purpose: explanation.
- **Processing art:** three stations (Nghe & chép lời, Tóm tắt, Sinh thẻ) tied to the lecture status. Done stations are ink, pending ones are rule, and only the active station moves: bars `scaleY` 900ms ease-in-out alternate, lines write left-to-right 2s linear, and cards drop in 1.6s ease-out.
- **Empty states:** static line drawings of the calendar block with one red mark (+, play, dashed code, quiz dots). They don't animate.
- **Done for today:** up to 7 green-banded torn sheets drop into a loose pile once, 560ms ease-out with a 70ms stagger.
- Under reduced motion, all ambient animation stops, the static poses stay, and the login tear becomes a fade.

### Notes and Empty States
Errors appear as a red-soft block with red-deep 13px text and `role="alert"`. Empty states use a dashed hairline box with a bold title, an ink-2 explanation, and an optional action. Skeletons are pulsing panel blocks.

## Do's and Don'ts

### Do:
- **Do** open every page and sheet with a title over the 3px double ink rule.
- **Do** show the day's one number in Barlow Condensed bold red. Use a single hero numeral per screen.
- **Do** keep red for due, today, current, or wrong, and green for done or correct.
- **Do** use the perforated edge and sheet-lift shadow only on calendar sheets.
- **Do** give every pressable the 0.97 press scale, and give every animation a reduced-motion fallback.
- **Do** use the 2px ink focus outline with a 2px offset (`:focus-visible`, inside `@layer base` so inputs keep their own ink border and halo). Red rings read as errors.
- **Do** print the lunar date ("Âm lịch d/m", ink-3, via `Intl` `vi-VN-u-ca-chinese`) under the solar date on the home, login and Done sheets.
- **Do** mark teacher-corrected cards and questions with the red PenLine "đã sửa" mark, backed by the `edited` flag.
- **Do** use lucide line icons at 16px for actions, with an `aria-label` on icon-only buttons.

### Don't:
- **Don't** build stat-card dashboards, progress rings, or KPI tiles. Show progress as a pipeline bar, a count, or a sheet.
- **Don't** use cream or warm-tinted grounds. The paper is crisp white (#fdfdfb).
- **Don't** set words in Barlow Condensed, and don't add display sizes between 28px and the numeral.
- **Don't** give flat surfaces (tables, forms, lists) a shadow. Use a hairline.
- **Don't** use typographic glyphs (●, →) as icons or status markers. Use a lucide icon or plain text.
- **Don't** put a coloured side stripe (border-left over 1px) on rows, callouts or revealed answers.
- **Don't** make a dismiss or toggle-close button red. Red primary is for the one forward action.
