const timeline = document.querySelector('.process-timeline');
const steps = [...timeline.querySelectorAll('.process-step')];
const markers = steps.map(step => step.querySelector('.step-number'));
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0;

function updateTimeline() {
  frame = 0;
  // Reduced motion keeps the complete static timeline; nothing depends on scrolling.
  if (motion.matches) {
    timeline.classList.remove('timeline-enhanced');
    return;
  }
  const bounds = timeline.getBoundingClientRect();
  const centers = markers.map(marker => {
    const rect = marker.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
  const length = centers.at(-1) - centers[0];
  const anchor = window.innerHeight * 0.75;
  const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  const progress = atEnd ? 1 : Math.max(0, Math.min(1, (anchor - centers[0]) / length));

  // Read layout first, then write; scroll events share one animation-frame update.
  timeline.style.setProperty('--track-top', `${centers[0] - bounds.top}px`);
  timeline.style.setProperty('--track-length', `${length}px`);
  timeline.style.setProperty('--progress', progress);
  timeline.style.setProperty('--progress-distance', `${length * progress}px`);
  steps.forEach((step, index) => step.classList.toggle('is-reached', atEnd || centers[index] <= anchor));
  timeline.classList.add('timeline-enhanced');
}

function scheduleUpdate() {
  if (!frame) frame = requestAnimationFrame(updateTimeline);
}

window.addEventListener('scroll', scheduleUpdate, { passive: true });
window.addEventListener('resize', scheduleUpdate, { passive: true });
window.addEventListener('pageshow', scheduleUpdate);
motion.addEventListener('change', scheduleUpdate);
scheduleUpdate();
