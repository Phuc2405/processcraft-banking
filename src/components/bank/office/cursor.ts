/** Hovering something clickable in the office: the canvas shows a pointer instead of the grab hand (see index.css). */
export const cursor = (on: boolean): void => {
  if (on) document.body.dataset.hover3d = '';
  else delete document.body.dataset.hover3d;
};
