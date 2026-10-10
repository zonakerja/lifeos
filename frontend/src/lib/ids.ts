/** ID entitas buatan client: `<prefix>-<waktu base36>-<acak>` */
export const generateId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 11);
  const timePart = Date.now().toString(36);
  return `${prefix}-${timePart}-${randomPart}`;
};
