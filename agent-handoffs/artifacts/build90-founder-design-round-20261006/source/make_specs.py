"""Writes the board specs (source/boards/*.json) for B90-1..B90-3."""
import json, os
os.makedirs('source/boards', exist_ok=True)
S = 0.33

def cell(f, caption, note=''):
    return {'file': f, 'caption': caption, 'note': note}

def write(name, spec):
    spec.setdefault('scale', S)
    json.dump(spec, open(f'source/boards/{name}.json', 'w'), indent=1)

# B90-1 Logger stopwatch
C1 = 'captures/b90-1/b90-1-'
OPT1 = [('current', 'Current (Build 89)', 'No phone stopwatch; Live Activity only'),
        ('a', 'Option A · docked tile', 'Stopwatch tile beside Finish Workout'),
        ('b', 'Option B · floating pill', 'Pill above the bar, only while resting'),
        ('c', 'Option C · footer status line', 'Quiet line inside the bar above Finish')]
def b1(name, title, state, appearance, sub, options=OPT1):
    write(name, {'out': f'boards/{name}.png', 'title': title, 'subtitle': sub,
                 'rows': [{'cells': [cell(f'{C1}{k}-{appearance}-{state}.png', c, n) for k, c, n in options]}]})
common1 = 'Real shipping Logger (Sandbox, iPhone 17 Pro) with the same Chest + Core workout in every column. The clock reads the canonical draft.rest anchor (the Watch and Live Activity source); values are frozen at 1:24 rest / 12:34 workout for comparison.'
b1('B90-1a-stopwatch-no-rest', 'B90-1a · Logger stopwatch · no active rest (before first set)', 'norest', 'light',
   common1 + ' A shows the WORKOUT clock when no rest is running (the Live Activity rule); B shows nothing; C shows a quiet hint.')
b1('B90-1b-stopwatch-active-rest', 'B90-1b · Logger stopwatch · active stopwatch rest', 'rest', 'light',
   common1 + ' Two sets complete; rest started by the authority on Complete Set.')
b1('B90-1c-stopwatch-long-scrolled', 'B90-1c · Logger stopwatch · long workout scrolled to the end', 'scrolled', 'light',
   common1 + ' Scrolled to the final exercise (Planks): every option sits inside the existing sticky bar safe-area, so the last set row and Add set stay above it and the tab bar is never covered.')
b1('B90-1d-stopwatch-dark', 'B90-1d · Logger stopwatch · Dark', 'rest', 'dark',
   'Same active-rest state in Dark.', OPT1[1:])

# B90-2 Watch handoff
C2 = 'captures/b90-2/b90-2-'
OPT2 = [('a', 'Option A · bottom sheet', 'System sheet, compact detent'),
        ('b', 'Option B · centered card', 'Card over a dimmed Logger'),
        ('c', 'Option C · docked panel', 'Replaces the sticky bar; Logger stays live')]
def b2(name, title, state, appearance, sub, lead=None):
    cells = ([lead] if lead else []) + [cell(f'{C2}{k}-{appearance}-{state}.png', c, n) for k, c, n in OPT2]
    write(name, {'out': f'boards/{name}.png', 'title': title, 'subtitle': sub, 'rows': [{'cells': cells}]})
common2 = 'Entering the active Logger before the first set with a paired Watch that has PhysiqueOS installed. Same workout in every column; only the container differs (the content is one shared view).'
b2('B90-2a-handoff-offer', 'B90-2a · Watch handoff · paired initial state', 'offer', 'light', common2,
   lead=cell('captures/b90-1/b90-1-current-light-norest.png', 'Current (Build 89)', 'Large Ready for Watch card; protocol assumed'))
b2('B90-2b-handoff-waiting', 'B90-2b · Watch handoff · connecting / waiting', 'waiting', 'light',
   'After Ready on Watch. The phone asks watchOS to open PhysiqueOS (HKHealthStore.startWatchApp) but cannot guarantee the Watch comes to the front, so the instruction is always shown. Use without Watch stays available.')
b2('B90-2c-handoff-acknowledged', 'B90-2c · Watch handoff · Watch acknowledged', 'acknowledged', 'light',
   'Shown when the phone authority applies the Watch’s Start (draft.watchStartedAt becomes non-nil), then auto-dismisses into the normal Logger.')
b2('B90-2d-handoff-unreachable', 'B90-2d · Watch handoff · paired but unreachable fallback', 'unreachable', 'light',
   'startWatchApp failed or no acknowledgment within a bounded wait. Truthful instruction instead of promising automatic launch.')
b2('B90-2e-handoff-dark', 'B90-2e · Watch handoff · Dark', 'offer', 'dark', 'Initial state in Dark for all three treatments.')
write('B90-2f-handoff-after-flow', {'out': 'boards/B90-2f-handoff-after-flow.png',
  'title': 'B90-2f · After the flow: what replaces the Ready for Watch card',
  'subtitle': 'The large card is removed in both outcomes. Shown with B90-1 Option A so the phone-only path is visible. Use without Watch is not asked again during this workout.',
  'rows': [{'cells': [cell('captures/b90-1/b90-1-current-light-norest.png', 'Current (Build 89)', 'Ready for Watch card before first set'),
                      cell(f'{C2}a-light-on-watch.png', 'After Watch acknowledged', 'Quiet "On Watch" chip in the nav bar'),
                      cell(f'{C2}a-light-without.png', 'After Use without Watch', 'Normal Logger; no card, no re-prompt')]}]})

# B90-3 Photo viewer
C3 = 'captures/b90-3/b90-3-'
OPT3 = [('current', 'Current (Build 89)', 'Full-height panes'),
        ('a', 'Option A · captioned stage', 'Top stage, dated captions, text below'),
        ('b', 'Option B · centered group', 'Labels on photos, text card, zoom pill'),
        ('c', 'Option C · framed panel', 'Column headers, zoom row, text below')]
def b3(name, title, pose, appearance, sub):
    write(name, {'out': f'boards/{name}.png', 'title': title, 'subtitle': sub,
                 'rows': [{'cells': [cell(f'{C3}{k}-{appearance}-{pose}.png', c, n) for k, c, n in OPT3]}]})
common3 = 'Expanded paired viewer on the safe synthetic review photos (no Founder media). The interpretation is the canonical persisted per-pose narrative from the briefing record, not hard-coded. Pinch zoom and synchronized pan are unchanged and bounded to the stage.'
b3('B90-3a-photo-front-mineral', 'B90-3a · Photo viewer · Front Relaxed · Mineral Light', 'front', 'light', common3)
b3('B90-3b-photo-back-mineral', 'B90-3b · Photo viewer · Back Relaxed · Mineral Light', 'back', 'light', common3)
b3('B90-3c-photo-flexed-mineral', 'B90-3c · Photo viewer · Back Flexed · Mineral Light', 'flexed', 'light', common3)
b3('B90-3d-photo-wide-frame-mineral', 'B90-3d · Photo viewer · wider frame (1:1 flexed crop) · Mineral Light', 'flexed-wide', 'light',
   'The flexed pair center-cropped to 1:1 to test a wider frame. The fitted stage shrinks to the photos instead of growing blank bands; the space left over reads as page background.')
b3('B90-3e-photo-front-dark', 'B90-3e · Photo viewer · Front Relaxed · Dark', 'front', 'dark', 'Same state in Dark.')
b3('B90-3f-photo-wide-frame-dark', 'B90-3f · Photo viewer · wider frame · Dark', 'flexed-wide', 'dark', 'Wider-frame check in Dark.')
print('ok')
