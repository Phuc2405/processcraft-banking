import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { VISIT_3D } from '../../../engine/plan/deskVisitPaths';
import { customerShirt, deskPose, queueSalt } from '../../../engine/plan/layout3d';
import { useLocale } from '../../../i18n/locale';
import { statusOfPhase, visitFrame, type VisitWork } from '../../../sim/deskVisit';
import { STATUS_COLOR, STATUS_TEXT, TAG_STYLE } from '../personStatus';
import { useDeskVisits, visitElapsed, type ActiveVisit } from '../../../store/deskVisitStore';
import { CustomerFigure } from './Avatars';

/** The people at the staffed counters (savings, collateral, Pay-in-4 appraisal) in the 3D office, from the same timeline as the 2D map, with the case's status over the customer's head. */

const OFFICER_SHIRT = '#1e3a8a';
const WORK_COLOR: Readonly<Record<VisitWork, string>> = { cash: '#4ade80', dispute: '#60a5fa', close: '#34d399', lock: '#22d3ee', liquidate: '#fbbf24', appraise: '#a78bfa', refuse: '#f87171' };

/** What hangs over the counter while a case is worked: coins for a closure, a padlock for a lock, and both colours of the same token for a liquidation. */
function WorkToken({ work }: { work: VisitWork }) {
  const color = WORK_COLOR[work];
  if (work === 'lock') {
    return (
      <group>
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.3, 0.24, 0.12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <torusGeometry args={[0.09, 0.025, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    );
  }
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.17, 0.17, 0.05, 20]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.4} roughness={0.35} />
    </mesh>
  );
}

function VisitCrew({ visit }: { visit: ActiveVisit }) {
  const { step } = visit;
  const geo = VISIT_3D[step.desk];
  const locale = useLocale();
  const label = useRef<HTMLDivElement>(null);
  const labelAnchor = useRef<Group>(null);
  const pose = useMemo(() => deskPose(step.desk), [step.desk]);
  const salt = useMemo(() => queueSalt(step.desk), [step.desk]);
  const keys = useMemo(() => visitFrame(step, geo, 0).map((f) => f.key), [step, geo]);
  const roots = useRef<Array<Group | null>>([]);
  const walking = useRef<Array<Group | null>>([]);
  const standing = useRef<Array<Group | null>>([]);
  const token = useRef<Group>(null);
  const ring = useRef<Mesh>(null);

  useFrame(({ clock, invalidate }) => {
    const figures = visitFrame(step, geo, visitElapsed(visit));
    let working = false;
    figures.forEach((f, i) => {
      const root = roots.current[i];
      if (!root) return;
      root.visible = f.phase !== null;
      if (!f.phase) return;
      if (f.phase === 'transact') working = true;
      root.position.set(f.at[0], 0, f.at[1]);
      if (f.heading[0] !== 0 || f.heading[1] !== 0) root.rotation.y = Math.atan2(f.heading[0], f.heading[1]);
      const moving = f.phase === 'walk' || f.phase === 'leave';
      const w = walking.current[i];
      const s = standing.current[i];
      if (w) w.visible = moving;
      if (s) s.visible = !moving;
    });
    // The case's own customer carries its status over their head, the same words as on the 2D map.
    const lead = figures[0];
    if (labelAnchor.current && label.current) {
      labelAnchor.current.visible = !!lead?.phase;
      if (lead?.phase) {
        labelAnchor.current.position.set(lead.at[0], 2.25, lead.at[1]);
        const status = statusOfPhase(lead.phase);
        if (label.current.dataset.status !== status) {
          label.current.dataset.status = status;
          label.current.textContent = STATUS_TEXT[status][locale];
          label.current.style.color = STATUS_COLOR[status];
        }
      }
    }
    const t = clock.getElapsedTime();
    if (token.current) {
      token.current.visible = working;
      token.current.position.y = 1.75 + Math.sin(t * 3) * 0.06;
      token.current.rotation.y = t * 2;
    }
    if (ring.current) ring.current.visible = working;
    // The canvas draws on demand: while people are here, every frame is wanted.
    invalidate();
  });

  return (
    <group name={`desk-visitors-${step.desk}`}>
      {keys.map((key, i) => {
        const officer = key === 'officer';
        const shirt = officer ? OFFICER_SHIRT : customerShirt(i + salt);
        const look = i * 5 + salt;
        return (
          <group
            key={key}
            ref={(g) => {
              roots.current[i] = g;
            }}
            visible={false}
          >
            <group
              ref={(g) => {
                walking.current[i] = g;
              }}
            >
              <CustomerFigure index={look} shirt={shirt} walking phase={i * 1.7} />
            </group>
            <group
              ref={(g) => {
                standing.current[i] = g;
              }}
            >
              <CustomerFigure index={look} shirt={shirt} phase={i * 1.7} />
            </group>
            {/* The officer carries the case file. */}
            {officer && (
              <mesh position={[0.2, 0.62, 0.17]}>
                <boxGeometry args={[0.22, 0.28, 0.03]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.8} />
              </mesh>
            )}
          </group>
        );
      })}
      <group ref={labelAnchor} visible={false}>
        <Html center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div
            ref={label}
            data-testid={`desk-visit-status-${step.desk}`}
            style={TAG_STYLE}
          />
        </Html>
      </group>
      <group ref={token} position={[pose.x, 1.75, pose.z]} visible={false}>
        <WorkToken work={step.work} />
      </group>
      <mesh ref={ring} position={[pose.x, 0.03, pose.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[2.0, 2.15, 40]} />
        <meshBasicMaterial color={WORK_COLOR[step.work]} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

export function DeskVisitors3D() {
  const visits = useDeskVisits();
  return (
    <>
      {visits.map((v) => (
        <VisitCrew key={v.id} visit={v} />
      ))}
    </>
  );
}
