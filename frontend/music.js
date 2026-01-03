// Background music player with playlist support
// Use global window object to persist audio across page loads
if (!window.pactoryMusic) {
  window.pactoryMusic = {
    audio: null,
    isEnabled: false,
    initialized: false,
    pendingUserGesturePlay: false,
    currentTrackIndex: 0,
    preloadedTracks: []
  };
}

let backgroundMusic = window.pactoryMusic.audio;
let isMusicEnabled = window.pactoryMusic.isEnabled;
let musicInitialized = window.pactoryMusic.initialized;
let pendingUserGesturePlay = window.pactoryMusic.pendingUserGesturePlay;
let currentTrackIndex = window.pactoryMusic.currentTrackIndex;
let preloadedTracks = window.pactoryMusic.preloadedTracks;

// Playlist - tracks will play in order and loop
const playlist = [
  "./assets/music/Up - Married Life.mp3",
  "./assets/music/Merry-Go-Round of Life - Howl's Moving Castle [Piano]  Joe Hisaishi.mp3",
  "./assets/music/18. The Flower Garden.mp3",
];

// Preload all tracks to prevent buffering (use global if available)
if (!preloadedTracks || preloadedTracks.length === 0) {
  preloadedTracks = [];
  window.pactoryMusic.preloadedTracks = preloadedTracks;
}

// Save playback state before page unload
window.addEventListener("beforeunload", () => {
  // Sync state to global
  window.pactoryMusic.audio = backgroundMusic;
  window.pactoryMusic.isEnabled = isMusicEnabled;
  window.pactoryMusic.currentTrackIndex = currentTrackIndex;
  window.pactoryMusic.pendingUserGesturePlay = pendingUserGesturePlay;
  
  if (backgroundMusic && !backgroundMusic.paused) {
    localStorage.setItem(
      "pactory-music-time",
      backgroundMusic.currentTime.toString()
    );
    localStorage.setItem("pactory-music-track", currentTrackIndex.toString());
    localStorage.setItem("pactory-music-enabled", "true");
  }
});

// Preload tracks to prevent buffering
function preloadTracks() {
  // Only preload if not already done
  if (preloadedTracks.length > 0 && preloadedTracks.every(track => track)) {
    console.log("🎵 Tracks already preloaded");
    return;
  }
  
  playlist.forEach((src, index) => {
    if (preloadedTracks[index]) return; // Already preloaded
    
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = src;
    preloadedTracks[index] = audio;
    window.pactoryMusic.preloadedTracks[index] = audio;
    
    // Preload the audio - start loading immediately
    audio.load();

    // Pre-fetch the audio data
    audio.addEventListener(
      "canplaythrough",
      () => {
        console.log(`🎵 Track ${index + 1} preloaded`);
      },
      { once: true }
    );
  });
}

export function initMusic() {
  // Sync state from global
  backgroundMusic = window.pactoryMusic.audio;
  isMusicEnabled = window.pactoryMusic.isEnabled;
  musicInitialized = window.pactoryMusic.initialized;
  pendingUserGesturePlay = window.pactoryMusic.pendingUserGesturePlay;
  currentTrackIndex = window.pactoryMusic.currentTrackIndex;
  preloadedTracks = window.pactoryMusic.preloadedTracks;
  
  // Only initialize once globally (not per page) - reuse existing audio if available
  if (musicInitialized && backgroundMusic) {
    // Sync state
    isMusicEnabled = !backgroundMusic.paused;
    window.pactoryMusic.isEnabled = isMusicEnabled;
    
    // Just update the button state if music should be playing
    const musicPreference = localStorage.getItem("pactory-music-enabled");
    if (
      musicPreference === "true" &&
      backgroundMusic &&
      !backgroundMusic.paused
    ) {
      updateButtonState(true);
    } else {
      // Update button state based on preference
      updateButtonState(musicPreference === "true");
    }
    // Ensure button exists
    createMusicControl();
    return;
  }

  musicInitialized = true;
  window.pactoryMusic.initialized = true;

  // Preload all tracks
  preloadTracks();

  // Create audio element (reuse if exists)
  if (!backgroundMusic) {
    backgroundMusic = new Audio();
    backgroundMusic.preload = "auto";
    window.pactoryMusic.audio = backgroundMusic;
  }

  // Restore track index and position
  const savedTrackIndex = localStorage.getItem("pactory-music-track");
  if (savedTrackIndex) {
    const index = parseInt(savedTrackIndex, 10);
    if (!isNaN(index) && index >= 0 && index < playlist.length) {
      currentTrackIndex = index;
    }
  }

  // Load the current track
  loadTrack(currentTrackIndex);

  // Set music properties
  backgroundMusic.volume = 0.3; // 30% volume - subtle background music

  // Handle track ending - move to next track
  backgroundMusic.addEventListener("ended", () => {
    console.log(`🎵 Track ${currentTrackIndex + 1} ended, moving to next`);
    playNextTrack();
  });

  // Preload next track while current is playing to prevent buffering
  let preloadScheduled = false;
  backgroundMusic.addEventListener("timeupdate", () => {
    // When track is 80% through, preload next track
    if (!preloadScheduled && backgroundMusic.duration > 0) {
      const progress = backgroundMusic.currentTime / backgroundMusic.duration;
      if (progress > 0.8) {
        preloadScheduled = true;
        const nextIndex = (currentTrackIndex + 1) % playlist.length;
        if (preloadedTracks[nextIndex]) {
          // Ensure next track is fully loaded
          preloadedTracks[nextIndex].load();
          console.log(`🎵 Preloading track ${nextIndex + 1}`);
        }
      }
    }
  });

  // Restore playback position if music was playing on previous page
  const savedTime = localStorage.getItem("pactory-music-time");
  let shouldRestoreTime = false;
  if (savedTime) {
    const time = parseFloat(savedTime);
    if (!isNaN(time) && time > 0) {
      shouldRestoreTime = true;
      backgroundMusic.addEventListener(
        "loadeddata",
        () => {
          // Only restore if we're on the same track
          const savedTrack = localStorage.getItem("pactory-music-track");
          if (savedTrack && parseInt(savedTrack, 10) === currentTrackIndex) {
            backgroundMusic.currentTime = Math.min(
              time,
              backgroundMusic.duration - 0.5
            );
            console.log(
              `🎵 Music restored to track ${
                currentTrackIndex + 1
              }, ${time.toFixed(2)}s`
            );
          }
        },
        { once: true }
      );
    }
  }

  // Handle music loading
  backgroundMusic.addEventListener("loadeddata", () => {
    console.log(`🎵 Track ${currentTrackIndex + 1} loaded successfully`);
  });

  backgroundMusic.addEventListener("error", (e) => {
    console.error("Music loading error:", e);
    const btn = document.getElementById("music-control");
    if (btn) {
      btn.title = "Music file not found - Check console";
      btn.style.opacity = "0.5";
    }
  });

  // Check if user has music preference saved
  const musicPreference = localStorage.getItem("pactory-music-enabled");
  if (musicPreference === "true") {
    // Wait for file to load (and restore time if needed), then enable
    const waitTime = shouldRestoreTime ? 800 : 500;
    setTimeout(() => {
      enableMusic();
    }, waitTime);
  }

  // Create music control button
  createMusicControl();
}

function loadTrack(index) {
  if (index < 0 || index >= playlist.length) {
    currentTrackIndex = 0; // Loop back to start
    index = 0;
  }

  currentTrackIndex = index;
  window.pactoryMusic.currentTrackIndex = currentTrackIndex;
  
  // Use preloaded track if available to prevent buffering
  if (preloadedTracks[index] && preloadedTracks[index].readyState >= 2) {
    // Use the preloaded audio's src
    backgroundMusic.src = preloadedTracks[index].src;
  } else {
    backgroundMusic.src = playlist[index];
  }
  backgroundMusic.load(); // Force load the new source
}

function playNextTrack() {
  const nextIndex = (currentTrackIndex + 1) % playlist.length;
  loadTrack(nextIndex);

  // Wait for track to load before playing to prevent buffering
  const playWhenReady = () => {
    if (isMusicEnabled) {
      const playPromise = backgroundMusic.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            console.log(`🎵 Now playing track ${currentTrackIndex + 1}`);
          })
          .catch((err) => {
            console.log("Error playing next track:", err);
          });
      }
    }
  };

  if (backgroundMusic.readyState >= 2) {
    // Already loaded, play immediately
    playWhenReady();
  } else {
    // Wait for track to load
    backgroundMusic.addEventListener("canplay", playWhenReady, { once: true });
  }

  // Save current track
  localStorage.setItem("pactory-music-track", currentTrackIndex.toString());
  localStorage.removeItem("pactory-music-time"); // Clear time when switching tracks
}

function createMusicControl() {
  // Check if button already exists
  if (document.getElementById("music-control")) {
    return;
  }

  const musicBtn = document.createElement("button");
  musicBtn.id = "music-control";
  musicBtn.innerHTML = "🎵";
  musicBtn.title = "Toggle Background Music";
  musicBtn.className = "music-control-btn";
  musicBtn.style.display = "flex";
  musicBtn.style.alignItems = "center";
  musicBtn.style.justifyContent = "center";

  musicBtn.addEventListener("click", () => {
    if (isMusicEnabled) {
      disableMusic();
    } else {
      enableMusic();
    }
  });

  // Add to page when body is ready
  const addButton = () => {
    if (document.body && !document.getElementById("music-control")) {
      document.body.appendChild(musicBtn);
      console.log("🎵 Music button created");
    }
  };

  if (document.body) {
    addButton();
  } else {
    document.addEventListener("DOMContentLoaded", addButton);
  }

  // Also try after a delay in case DOMContentLoaded already fired
  setTimeout(addButton, 1000);
}

function updateButtonState(enabled) {
  const btn = document.getElementById("music-control");
  if (btn) {
    if (enabled) {
      btn.innerHTML = "🔊";
      btn.title = "Music: ON - Click to turn off";
      btn.style.opacity = "1";
    } else {
      btn.innerHTML = "🔇";
      btn.title = "Music: OFF - Click to turn on";
    }
  }
}

function enableMusic() {
  if (!backgroundMusic) return;

  // If already playing, just reflect state
  if (!backgroundMusic.paused) {
    isMusicEnabled = true;
    window.pactoryMusic.isEnabled = true;
    localStorage.setItem("pactory-music-enabled", "true");
    updateButtonState(true);
    pendingUserGesturePlay = false;
    window.pactoryMusic.pendingUserGesturePlay = false;
    return;
  }

  // Ensure track is loaded before playing
  if (backgroundMusic.readyState < 2) {
    // Wait for track to be ready
    backgroundMusic.addEventListener(
      "canplay",
      () => {
        const playPromise = backgroundMusic.play();
        handlePlayPromise(playPromise);
      },
      { once: true }
    );
  } else {
    // Track is ready, play immediately
    const playPromise = backgroundMusic.play();
    handlePlayPromise(playPromise);
  }
}

function handlePlayPromise(playPromise) {
  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        console.log(`🎵 Track ${currentTrackIndex + 1} is playing`);
        isMusicEnabled = true;
        window.pactoryMusic.isEnabled = true;
        pendingUserGesturePlay = false;
        window.pactoryMusic.pendingUserGesturePlay = false;
        localStorage.setItem("pactory-music-enabled", "true");
        updateButtonState(true);
      })
      .catch((err) => {
        console.log(
          "Music autoplay blocked; will start on next interaction:",
          err
        );

        // IMPORTANT: do NOT mark as enabled yet (prevents the "double click" bug)
        isMusicEnabled = false;
        pendingUserGesturePlay = true;

        localStorage.setItem("pactory-music-enabled", "true");

        // Show OFF state (or you can make a "tap to enable" state if you want)
        updateButtonState(false);

        // Arm one-time gesture start - listen for any user interaction
        const startOnGesture = () => {
          if (pendingUserGesturePlay && !isMusicEnabled) {
            enableMusic();
            pendingUserGesturePlay = false;
          }
          document.removeEventListener("click", startOnGesture);
          document.removeEventListener("touchstart", startOnGesture);
        };
        document.addEventListener("click", startOnGesture, { once: true });
        document.addEventListener("touchstart", startOnGesture, { once: true });
      });
  }
}

function disableMusic() {
  if (!backgroundMusic) return;

  backgroundMusic.pause();
  isMusicEnabled = false;
  window.pactoryMusic.isEnabled = false;
  localStorage.setItem("pactory-music-enabled", "false");
  localStorage.removeItem("pactory-music-time"); // Clear saved time when manually stopped
  updateButtonState(false);
}

// Function to set music source (call this with your music file)
export function setMusicSource(url) {
  if (backgroundMusic) {
    backgroundMusic.src = url;
    if (isMusicEnabled) {
      backgroundMusic.play().catch((err) => {
        console.log("Music play error:", err);
      });
    }
  }
}
