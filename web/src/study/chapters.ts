export const STUDY_DURATION_MS = 160_000;

/** Seven scenes. `start` is the autoplay cue in seconds; presenter mode ignores it. */
export const chapters = [
  { id: 'ask', start: 0, label: 'The ask', tag: 'sim',
    title: 'A new flight wants to cross a full ocean.',
    line: 'Fit it in without moving anyone already cleared.' },
  { id: 'conflict', start: 16, label: 'The conflict', tag: 'sim',
    title: 'Its filed route runs into cleared traffic.',
    line: 'Same level, same airspace, minutes apart.' },
  { id: 'options', start: 36, label: 'The options', tag: 'sim',
    title: 'Every way it could fly instead, scored by disruption.',
    line: 'Small, sustained changes score low. Zig-zags score high.' },
  { id: 'orbit', start: 58, label: 'ORBIT decides', tag: 'sim',
    title: 'A probabilistic computer weighs them all at once.',
    line: 'It explores widely, then settles on the simplest safe route.' },
  { id: 'clearance', start: 80, label: 'The clearance', tag: 'sim',
    title: 'Checked independently. Sent to the cockpit.',
    line: 'Nothing is issued unless separation and schedule both pass.' },
  { id: 'study', start: 106, label: 'Proven at scale', tag: 'study',
    title: 'Tested on 60 busy Atlantic scenarios, on ORBIT hardware.',
    line: 'Simple fixes, schedules held, answers in about a second.' },
  { id: 'next', start: 132, label: 'What’s next', tag: 'roadmap',
    title: 'From one flight to a full day of operations.',
    line: 'What this demonstrator shows today, and what comes next.' },
] as const;

export type SceneId = typeof chapters[number]['id'];

export function chapterAt(elapsedMs: number) {
  return chapters.reduce((index, chapter, i) => elapsedMs >= chapter.start * 1000 ? i : index, 0);
}

export function clockLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
