import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useRef } from 'react';
import type { Group } from 'three';
import { counterTags } from '../../../engine/simulation/peopleTags';
import { useLocale } from '../../../i18n/locale';
import { STATUS_COLOR, STATUS_TEXT, TAG_STYLE } from '../personStatus';
import { useWorld } from './WorldProvider';

/** How many customers carry a status at once: enough for every counter and ATM, few enough to leave the floor readable. */
const TAGS = 16;
/** Over the head of a standing figure (the visits' labels hang at the same height). */
const HEAD = 2.1;

/**
 * The status over the heads of the customers at the teller, the disputes desk and the ATMs (engine/simulation/peopleTags.ts), the
 * same words as at the Savings Desk and the vault, shown in either label mode as theirs are. A fixed pool written to each frame, so
 * nothing re-renders as people move.
 */
export const PeopleTags3D = memo(function PeopleTags3D() {
  const world = useWorld();
  const locale = useLocale();
  const anchors = useRef<Array<Group | null>>([]);
  const boxes = useRef<Array<HTMLDivElement | null>>([]);
  useFrame(() => {
    const tags = counterTags(world, TAGS);
    for (let i = 0; i < TAGS; i++) {
      const g = anchors.current[i];
      const box = boxes.current[i];
      if (!g || !box) continue;
      const tag = tags[i];
      g.visible = !!tag;
      if (!tag) {
        if (box.style.display !== 'none') box.style.display = 'none';
        continue;
      }
      g.position.set(tag.x, HEAD, tag.z);
      if (box.dataset.status !== tag.status || box.dataset.locale !== locale) {
        box.dataset.status = tag.status;
        box.dataset.locale = locale;
        box.textContent = STATUS_TEXT[tag.status][locale];
        box.style.color = STATUS_COLOR[tag.status];
      }
      if (box.style.display !== 'block') box.style.display = 'block';
    }
  });
  return (
    <group name="office-people-tags">
      {Array.from({ length: TAGS }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            anchors.current[i] = g;
          }}
          visible={false}
        >
          <Html center zIndexRange={[11, 0]} style={{ pointerEvents: 'none' }}>
            <div
              ref={(el) => {
                boxes.current[i] = el;
              }}
              data-testid="people-tag"
              style={{ ...TAG_STYLE, display: 'none' }}
            />
          </Html>
        </group>
      ))}
    </group>
  );
});
