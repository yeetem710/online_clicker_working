"use client";

import { useEffect, useRef } from 'react';
import useGameStore from '@/lib/gameStore';
import { DEFAULT_PHASER_CONFIG } from '@/lib/phaserConfig';
// import dynamic from 'next/dynamic';

// Import Phaser and PaperclipScene only on client side
let Phaser: any;
let PaperclipScene: any;

if (typeof window !== 'undefined') {
  try {
    // Use a relative path to ensure the module can be found
    Phaser = require('phaser');
    // Make sure to use the correct path to PaperclipScene
    PaperclipScene = require('../../scenes/PaperclipScene').default;
  } catch (error) {
  }
}

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get game actions and state from Zustand
  const gameStore = useGameStore();
  const { clickPaperclip } = gameStore;

  useEffect(() => {
    // Check if the game has already been initialized or if we're in SSR
    if (typeof window === 'undefined') {
      return;
    }
    
    // Prevent multiple game instances
    if (gameRef.current || (window as any).__PHASER_GAME_INSTANCE__) {
      return;
    }

    // Clean up WebGL contexts before creating a new one
    const cleanUpWebGLContexts = () => {
      try {
        // Get all canvas elements
        const canvases = document.querySelectorAll('canvas');
        
        // Look for inactive WebGL canvases and clean them up
        canvases.forEach(canvas => {
          if (canvas && !canvas.parentElement && 
              (canvas.width === 0 || canvas.height === 0 || !canvas.isConnected)) {
            // Remove the canvas from DOM
            if (canvas.parentNode) {
              canvas.parentNode.removeChild(canvas);
            }
            
            // Force garbage collection on WebGL context
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl && 'getExtension' in gl) {
              (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
            }
          }
        });
      } catch (err) {
      }
    };

    // Clean up WebGL contexts
    cleanUpWebGLContexts();

    // Make sure Phaser is loaded and the container is ready
    if (Phaser && PaperclipScene && containerRef.current) {
      try {
        // Mark that we're attempting to load Phaser
        (window as any).PHASER_LOADING = true;
        
        // Completely disable Phaser's sound manager before game creation
        if (Phaser.Sound && Phaser.Sound.WebAudioSoundManager) {
          Phaser.Sound.WebAudioSoundManager.prototype.createAudioContext = function() {
            return null;
          };
        }
        if (Phaser.Sound && Phaser.Sound.HTML5AudioSoundManager) {
          Phaser.Sound.HTML5AudioSoundManager.prototype.add = function() {
            return null;
          };
        }
        
        // Custom config extending the default
        const config = {
          ...DEFAULT_PHASER_CONFIG,
          parent: containerRef.current,
          scene: [PaperclipScene],
          // Ensure we're using a single well-managed canvas renderer
          canvas: document.getElementById('paperclip-game-canvas') as HTMLCanvasElement || undefined,
          // Force disable all audio to prevent AudioContext errors
          audio: {
            noAudio: true,
            disableWebAudio: true,
          },
          // Disable plugins that might use audio
          plugins: {
            global: [],
            scene: []
          }
        };

        // Initialize the Phaser game with error handling
        try {
          gameRef.current = new Phaser.Game(config);
        } catch (gameError) {
          console.error('Failed to initialize Phaser game:', gameError);
          // Dispatch error event so parent can handle it
          const errorEvent = new Event('phaser-init-error');
          window.dispatchEvent(errorEvent);
          return;
        }
        
        // Mark this instance globally to prevent duplicates
        (window as any).__PHASER_GAME_INSTANCE__ = gameRef.current;

        // Make the clickPaperclip function available to Phaser scenes
        (window as any).clickPaperclip = clickPaperclip;
        
        // Expose the Zustand store to the Phaser scene
        (window as any).__ZUSTAND_STORE__ = {
          getState: () => gameStore,
          subscribe: (callback: () => void) => {
            try {
              const unsubscribe = useGameStore.subscribe(callback);
              return unsubscribe;
            } catch (err) {
              return () => {}; // Return empty function as fallback
            }
          }
        };
        
        // Mark Phaser as successfully loaded
        (window as any).PHASER_LOADED = true;
        delete (window as any).PHASER_LOADING;
        
      } catch (err) {
        const errorEvent = new Event('phaser-load-error');
        window.dispatchEvent(errorEvent);
      }
    } else {
      // If Phaser or PaperclipScene couldn't be loaded, trigger error event
      if (typeof window !== 'undefined' && !(window as any).PHASER_LOADING) {
        const errorEvent = new Event('phaser-load-error');
        window.dispatchEvent(errorEvent);
      }
    }

    // Cleanup function to destroy the game when the component unmounts
    return () => {
      if (gameRef.current) {
        try {
          // Stop all scenes first
          const scenes = gameRef.current.scene.scenes;
          scenes.forEach((scene: any) => {
            if (scene && scene.scene) {
              scene.scene.stop();
            }
          });
          
          // Destroy the game instance
          gameRef.current.destroy(true);
          gameRef.current = null;
        } catch (error) {
          console.warn('Error cleaning up Phaser game:', error);
          // Force cleanup even if there's an error
          gameRef.current = null;
        }
      }
      
      // Clean up global references
      delete (window as any).__ZUSTAND_STORE__;
      delete (window as any).__PHASER_GAME_INSTANCE__;
      delete (window as any).clickPaperclip;
    };
  }, [clickPaperclip, gameStore]);

  return (
    <div 
      ref={containerRef} 
      id="phaser-game" 
      className="w-full h-full flex items-center justify-center"
      style={{ minHeight: '300px' }} // Reduced height
      data-zustand-store="true"
    >
      {/* Persistent canvas element for Phaser to reuse */}
      <canvas id="paperclip-game-canvas" className="w-full h-full" style={{ display: 'none' }} />
    </div>
  );
}