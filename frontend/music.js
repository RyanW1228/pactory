// Background music player
let backgroundMusic = null;
let isMusicEnabled = false;
let musicInitialized = false;

// Save playback position before page unload
window.addEventListener('beforeunload', () => {
  if (backgroundMusic && !backgroundMusic.paused) {
    localStorage.setItem('pactory-music-time', backgroundMusic.currentTime.toString());
    localStorage.setItem('pactory-music-enabled', 'true');
  }
});

export function initMusic() {
  // Only initialize once per page load
  if (musicInitialized) {
    // Just update the button state if music should be playing
    const musicPreference = localStorage.getItem('pactory-music-enabled');
    if (musicPreference === 'true' && backgroundMusic && !backgroundMusic.paused) {
      updateButtonState(true);
    }
    return;
  }
  
  musicInitialized = true;
  
  // Create audio element
  backgroundMusic = new Audio();
  
  // Load the music file
  backgroundMusic.src = './assets/music/Up - Married Life.mp3';
  
  // Set music properties
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.3; // 30% volume - subtle background music
  
  // Restore playback position if music was playing on previous page
  const savedTime = localStorage.getItem('pactory-music-time');
  let shouldRestoreTime = false;
  if (savedTime) {
    const time = parseFloat(savedTime);
    if (!isNaN(time) && time > 0) {
      shouldRestoreTime = true;
      backgroundMusic.addEventListener('loadeddata', () => {
        backgroundMusic.currentTime = time;
        console.log(`🎵 Music restored to ${time.toFixed(2)}s`);
      }, { once: true });
    }
  }
  
  // Handle music loading
  backgroundMusic.addEventListener('loadeddata', () => {
    console.log('🎵 Music loaded successfully');
  });
  
  backgroundMusic.addEventListener('error', (e) => {
    console.error('Music loading error:', e);
    const btn = document.getElementById('music-control');
    if (btn) {
      btn.title = 'Music file not found - Check console';
      btn.style.opacity = '0.5';
    }
  });
  
  // Check if user has music preference saved
  const musicPreference = localStorage.getItem('pactory-music-enabled');
  if (musicPreference === 'true') {
    // Wait for file to load (and restore time if needed), then enable
    const waitTime = shouldRestoreTime ? 800 : 500;
    setTimeout(() => {
      enableMusic();
    }, waitTime);
  }
  
  // Create music control button
  createMusicControl();
}

function createMusicControl() {
  // Check if button already exists
  if (document.getElementById('music-control')) {
    return;
  }
  
  const musicBtn = document.createElement('button');
  musicBtn.id = 'music-control';
  musicBtn.innerHTML = '🎵';
  musicBtn.title = 'Toggle Background Music';
  musicBtn.className = 'music-control-btn';
  musicBtn.style.display = 'flex';
  musicBtn.style.alignItems = 'center';
  musicBtn.style.justifyContent = 'center';
  
  musicBtn.addEventListener('click', () => {
    if (isMusicEnabled) {
      disableMusic();
    } else {
      enableMusic();
    }
  });
  
  // Add to page when body is ready
  const addButton = () => {
    if (document.body && !document.getElementById('music-control')) {
      document.body.appendChild(musicBtn);
      console.log('🎵 Music button created');
    }
  };
  
  if (document.body) {
    addButton();
  } else {
    document.addEventListener('DOMContentLoaded', addButton);
  }
  
  // Also try after a delay in case DOMContentLoaded already fired
  setTimeout(addButton, 1000);
}

function updateButtonState(enabled) {
  const btn = document.getElementById('music-control');
  if (btn) {
    if (enabled) {
      btn.innerHTML = '🔊';
      btn.title = 'Music: ON - Click to turn off';
      btn.style.opacity = '1';
    } else {
      btn.innerHTML = '🔇';
      btn.title = 'Music: OFF - Click to turn on';
    }
  }
}

function enableMusic() {
  if (!backgroundMusic) return;
  
  // Don't restart if already playing
  if (!backgroundMusic.paused && isMusicEnabled) {
    console.log('🎵 Music already playing, not restarting');
    return;
  }
  
  // Try to play the music
  const playPromise = backgroundMusic.play();
  
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        console.log('🎵 Music is playing');
        isMusicEnabled = true;
        localStorage.setItem('pactory-music-enabled', 'true');
        updateButtonState(true);
      })
      .catch(err => {
        console.log('Music autoplay prevented - user interaction required:', err);
        // Still mark as enabled, it will play on next user interaction
        isMusicEnabled = true;
        localStorage.setItem('pactory-music-enabled', 'true');
        updateButtonState(true);
      });
  }
}

function disableMusic() {
  if (!backgroundMusic) return;
  
  backgroundMusic.pause();
  isMusicEnabled = false;
  localStorage.setItem('pactory-music-enabled', 'false');
  localStorage.removeItem('pactory-music-time'); // Clear saved time when manually stopped
  updateButtonState(false);
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


