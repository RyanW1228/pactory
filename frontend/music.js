// Background music player
let backgroundMusic = null;
let isMusicEnabled = false;

export function initMusic() {
  // Create audio element
  backgroundMusic = new Audio();
  
  // Use a free ambient/chill music URL (you can replace this with your own)
  // For now, we'll use a data URI or you can add your own music file
  // Example: backgroundMusic.src = './assets/music.mp3';
  backgroundMusic.src = 'frontend/music/Up - Married Life.mp3';
  
  // Set music properties
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.3; // 30% volume - subtle background music
  
  // Check if user has music preference saved
  const musicPreference = localStorage.getItem('pactory-music-enabled');
  if (musicPreference === 'true') {
    enableMusic();
  }
  
  // Create music control button
  createMusicControl();
}

function createMusicControl() {
  const musicBtn = document.createElement('button');
  musicBtn.id = 'music-control';
  musicBtn.innerHTML = '🎵';
  musicBtn.title = 'Toggle Background Music';
  musicBtn.className = 'music-control-btn';
  
  musicBtn.addEventListener('click', () => {
    if (isMusicEnabled) {
      disableMusic();
    } else {
      enableMusic();
    }
  });
  
  // Add to page when body is ready
  if (document.body) {
    document.body.appendChild(musicBtn);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(musicBtn);
    });
  }
}

function enableMusic() {
  if (!backgroundMusic) return;
  
  // Only play if we have a source
  if (backgroundMusic.src) {
    backgroundMusic.play().catch(err => {
      console.log('Music autoplay prevented:', err);
      // User interaction required - music will play on next click
    });
  }
  
  isMusicEnabled = true;
  localStorage.setItem('pactory-music-enabled', 'true');
  
  const btn = document.getElementById('music-control');
  if (btn) {
    btn.innerHTML = '🔊';
    btn.title = 'Music: ON - Click to turn off';
  }
}

function disableMusic() {
  if (!backgroundMusic) return;
  
  backgroundMusic.pause();
  isMusicEnabled = false;
  localStorage.setItem('pactory-music-enabled', 'false');
  
  const btn = document.getElementById('music-control');
  if (btn) {
    btn.innerHTML = '🔇';
    btn.title = 'Music: OFF - Click to turn on';
  }
}

// Function to set music source (call this with your music file)
export function setMusicSource(url) {
  if (backgroundMusic) {
    backgroundMusic.src = url;
    if (isMusicEnabled) {
      backgroundMusic.play().catch(err => {
        console.log('Music play error:', err);
      });
    }
  }
}

