import React, { useState } from 'react';
import { User } from 'lucide-react';

/**
 * CachedImage Component
 * Uses native browser caching while tracking image load state via memory.
 * This completely bypasses CORS restrictions that block Cache API fetches from Firebase,
 * while eliminating UI flickering during app navigation!
 */
const loadedMemoryCache = new Set();
const errorMemoryCache = new Set();

const CachedImage = ({ src, alt, className, style, fallbackIcon: FallbackIcon = User, ...props }) => {
    // Determine initial state synchronously from memory to prevent any spinning
    const [isLoaded, setIsLoaded] = useState(() => {
        if (!src) return false;
        return loadedMemoryCache.has(src);
    });
    
    const [isError, setIsError] = useState(() => {
        if (!src) return true;
        return errorMemoryCache.has(src);
    });

    // Check prop changes
    const [currentSrc, setCurrentSrc] = useState(src);
    if (src !== currentSrc) {
        setCurrentSrc(src);
        if (!src) {
            setIsLoaded(false);
            setIsError(true);
        } else {
            setIsLoaded(loadedMemoryCache.has(src));
            setIsError(errorMemoryCache.has(src));
        }
    }

    const handleLoad = () => {
        if (src) loadedMemoryCache.add(src);
        setIsLoaded(true);
    };

    const handleError = () => {
        if (src) errorMemoryCache.add(src);
        setIsError(true);
        setIsLoaded(true); // Stop loading state
    };

    // If there is no src or it errored permanently, show fallback immediately
    if (!src || isError) {
        return (
            <div className={`flex items-center justify-center bg-slate-100 ${className || ''}`} style={style}>
                <FallbackIcon size={style?.width ? Math.min(parseInt(style.width) * 0.5, 30) : 24} className="text-slate-400" />
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', width: style?.width || '100%', height: style?.height || '100%', ...style }} className={className}>
            {/* The actual image loads in the background */}
            <img 
                src={src} 
                alt={alt || "Cached image"} 
                onLoad={handleLoad}
                onError={handleError}
                style={{ 
                    objectFit: 'cover', 
                    width: '100%', 
                    height: '100%',
                    borderRadius: style?.borderRadius || '0',
                    opacity: isLoaded ? 1 : 0, 
                    transition: 'opacity 0.2s ease-in-out',
                    position: 'absolute',
                    top: 0,
                    left: 0
                }} 
                {...props} 
            />

            {/* Spinner shows only if not loaded yet */}
            {!isLoaded && (
                <div 
                    className="flex items-center justify-center bg-slate-100" 
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: style?.borderRadius || '0'
                    }}
                >
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                </div>
            )}
        </div>
    );
};

export default CachedImage;
