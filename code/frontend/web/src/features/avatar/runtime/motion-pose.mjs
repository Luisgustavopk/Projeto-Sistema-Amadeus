const ease = (t) => t * t * (3 - 2 * t);
export function samplePose(points, seconds) {
  if (seconds <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [end, b] = points[i];
    if (seconds <= end) {
      const [start, a] = points[i - 1];
      return a + (b - a) * ease((seconds - start) / (end - start));
    }
  }
  return points.at(-1)[1];
}
export function motionWeight(seconds, duration, fadeOut) {
  return ease(
    Math.max(
      0,
      Math.min(1, seconds / 0.12, (duration + fadeOut - seconds) / fadeOut),
    ),
  );
}
