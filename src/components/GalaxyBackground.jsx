import React, { useEffect, useRef } from 'react';

const GalaxyBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let width = (canvas.width = canvas.parentElement?.offsetWidth || 280);
        let height = (canvas.height = canvas.parentElement?.offsetHeight || window.innerHeight);

        const handleResize = () => {
            if (!canvas.parentElement) return;
            width = canvas.width = canvas.parentElement.offsetWidth || 280;
            height = canvas.height = canvas.parentElement.offsetHeight || window.innerHeight;
        };

        window.addEventListener('resize', handleResize);

        // Generate stars
        const STAR_COUNT = 45;
        const stars = Array.from({ length: STAR_COUNT }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.4 + 0.3,
            alpha: Math.random() * 0.8 + 0.2,
            twinkleSpeed: (Math.random() * 0.02 + 0.008) * (Math.random() > 0.5 ? 1 : -1),
            vy: -(Math.random() * 0.25 + 0.08), // slow upward drift
            vx: (Math.random() - 0.5) * 0.08,
            color: ['#ffffff', '#a5b4fc', '#c4b5fd', '#67e8f9'][Math.floor(Math.random() * 4)]
        }));

        // Nebula cloud nodes
        const nebulae = [
            { x: width * 0.2, y: height * 0.25, r: 130, color: 'rgba(99, 102, 241, 0.45)', vx: 0.08, vy: 0.05, angle: 0 },
            { x: width * 0.8, y: height * 0.65, r: 150, color: 'rgba(168, 85, 247, 0.4)', vx: -0.06, vy: 0.07, angle: Math.PI },
            { x: width * 0.5, y: height * 0.9, r: 120, color: 'rgba(6, 182, 212, 0.35)', vx: 0.05, vy: -0.06, angle: Math.PI / 2 }
        ];

        // Occasional shooting star
        let shootingStar = null;
        const triggerShootingStar = () => {
            shootingStar = {
                x: Math.random() * width,
                y: Math.random() * (height * 0.4),
                length: Math.random() * 50 + 40,
                speed: Math.random() * 4 + 3,
                angle: (Math.PI / 4) + (Math.random() - 0.5) * 0.2,
                opacity: 1
            };
        };

        let nextShootingStarTime = Date.now() + Math.random() * 4000 + 3000;

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            // Draw Nebula Clouds
            nebulae.forEach(neb => {
                neb.angle += 0.005;
                const curX = neb.x + Math.sin(neb.angle) * 20;
                const curY = neb.y + Math.cos(neb.angle) * 20;

                const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, neb.r);
                grad.addColorStop(0, neb.color);
                grad.addColorStop(1, 'rgba(15, 23, 42, 0)');

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(curX, curY, neb.r, 0, Math.PI * 2);
                ctx.fill();
            });

            // Draw Stars
            stars.forEach(star => {
                // Twinkle
                star.alpha += star.twinkleSpeed;
                if (star.alpha > 0.95 || star.alpha < 0.2) {
                    star.twinkleSpeed = -star.twinkleSpeed;
                }

                // Drift
                star.y += star.vy;
                star.x += star.vx;

                if (star.y < 0) {
                    star.y = height;
                    star.x = Math.random() * width;
                }
                if (star.x < 0) star.x = width;
                if (star.x > width) star.x = 0;

                ctx.save();
                ctx.globalAlpha = Math.max(0.1, Math.min(1, star.alpha));
                ctx.fillStyle = star.color;
                ctx.shadowBlur = star.radius > 1 ? 6 : 0;
                ctx.shadowColor = star.color;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });

            // Shooting Star
            if (Date.now() > nextShootingStarTime && !shootingStar) {
                triggerShootingStar();
                nextShootingStarTime = Date.now() + Math.random() * 8000 + 5000;
            }

            if (shootingStar) {
                const tailX = shootingStar.x - Math.cos(shootingStar.angle) * shootingStar.length;
                const tailY = shootingStar.y - Math.sin(shootingStar.angle) * shootingStar.length;

                const grad = ctx.createLinearGradient(tailX, tailY, shootingStar.x, shootingStar.y);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                grad.addColorStop(1, `rgba(255, 255, 255, ${shootingStar.opacity})`);

                ctx.save();
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(shootingStar.x, shootingStar.y);
                ctx.stroke();
                ctx.restore();

                shootingStar.x += Math.cos(shootingStar.angle) * shootingStar.speed;
                shootingStar.y += Math.sin(shootingStar.angle) * shootingStar.speed;
                shootingStar.opacity -= 0.015;

                if (shootingStar.opacity <= 0 || shootingStar.x > width + 50 || shootingStar.y > height + 50) {
                    shootingStar = null;
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                opacity: 0.3,
                zIndex: 0,
                overflow: 'hidden'
            }}
        />
    );
};

export default React.memo(GalaxyBackground);
