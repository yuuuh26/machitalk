export function avatarStyle(avatar, mood = 'neutral') {
  const image = avatar.assets?.[mood] || avatar.assets?.neutral;
  if (!image) return '';
  const crop = avatar.crop;
  const sx = crop.sourceWidth / crop.width * 100;
  const sy = crop.sourceHeight / crop.height * 100;
  const px = image.x / (crop.sourceWidth - crop.width) * 100;
  const py = image.y / (crop.sourceHeight - crop.height) * 100;
  return `background-image:url('${avatar.image}');background-size:${sx}% ${sy}%;background-position:${px}% ${py}%;`;
}

export function setAvatar(element, avatar, mood) {
  if (!element || !avatar) return;
  element.style.cssText = avatarStyle(avatar, mood);
  element.dataset.mood = mood;
  element.setAttribute('aria-label', `${avatar.name}：${mood}`);
  element.classList.remove('react');
  void element.offsetWidth;
  if (['good', 'great', 'excellent', 'perfect'].includes(mood)) element.classList.add('react');
}
