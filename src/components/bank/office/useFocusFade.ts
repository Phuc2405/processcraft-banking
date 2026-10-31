import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Material, Mesh, Object3D } from 'three';
import type { PlaceId } from '../../../sim/topology';
import { activeFlowOf, bankStore } from '../../../store/bankStore';
import { deskFocus } from './focus3d';

/** Fades everything under `root` (the desk, its staff, its queue) to the opacity deskFocus gives `place`, easing there, so a pointed-at desk or a guided scenario stands out against the rest of the office. */
export function useFocusFade(root: RefObject<Object3D | null>, place: PlaceId): void {
  const now = useRef(1);
  useFrame((_, dt) => {
    const s = bankStore.getState();
    // A tour runs its own lighting, so it leaves the desks alone.
    const want = s.spotlight ? 1 : deskFocus(place, s.hoverPlace, activeFlowOf(s), s.subProcess);
    if (now.current === want && want === 1) return;
    now.current += (want - now.current) * Math.min(1, dt * 8);
    if (Math.abs(now.current - want) < 0.01) now.current = want;
    const o = now.current;
    root.current?.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      if (!mesh.userData.ownMaterial) {
        if (o >= 1) return;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : (mesh.material as Material).clone();
        mesh.userData.ownMaterial = true;
        mesh.userData.baseOpacity = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.opacity ?? 1;
        mesh.userData.baseTransparent = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.transparent ?? false;
      }
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const base = mesh.userData.baseOpacity as number;
        m.opacity = base * o;
        m.transparent = o < 1 || (mesh.userData.baseTransparent as boolean);
        m.depthWrite = o >= 1 && !(mesh.userData.baseTransparent as boolean);
      }
    });
  });
}
