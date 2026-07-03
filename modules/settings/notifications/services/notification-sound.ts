"use client";

const SOUND_URL = "/sounds/notification.wav";
let audio: HTMLAudioElement | null = null;
let unlocked = false;

function getAudio(): HTMLAudioElement {
  audio ??= new Audio(SOUND_URL);
  audio.preload = "auto";
  return audio;
}

export function isNotificationAudioUnlocked(): boolean {
  return unlocked;
}

export async function unlockNotificationAudio(volume: number): Promise<void> {
  const element = getAudio();
  element.volume = Math.max(0, Math.min(1, volume));
  try {
    await element.play();
    element.pause();
    element.currentTime = 0;
    unlocked = true;
  } catch (error) {
    unlocked = false;
    throw new Error(error instanceof Error ? error.message : "Audio playback was blocked");
  }
}

export async function playNotificationSound(volume: number): Promise<void> {
  if (!unlocked) throw new Error("Notification audio has not been activated in this tab");
  const element = getAudio();
  element.pause();
  element.currentTime = 0;
  element.volume = Math.max(0, Math.min(1, volume));
  await element.play();
}
