/**
 * GSAP Animation Hooks for SoupFinance
 * Provides reusable cinematic animation hooks for key flows
 *
 * Added: SOUP-679 — GSAP cinematic sequences for key flows
 *
 * @see https://gsap.com/docs/v3/
 */
import { useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';

// =============================================================================
// Dashboard Hero Entrance
// =============================================================================

/**
 * Animates dashboard elements with a staggered entrance
 * KPI cards slide up and fade in, followed by the activity section
 */
export function useDashboardEntrance() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      // Added: Page header entrance
      gsap.from('[data-anim="hero-heading"]', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
      });

      gsap.from('[data-anim="hero-subtext"]', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        delay: 0.15,
        ease: 'power3.out',
      });

      // Added: KPI cards stagger entrance
      gsap.from('[data-anim="kpi-card"]', {
        y: 40,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        delay: 0.3,
        ease: 'back.out(1.4)',
      });

      // Added: Activity section slides up
      gsap.from('[data-anim="activity-section"]', {
        y: 50,
        opacity: 0,
        duration: 0.6,
        delay: 0.7,
        ease: 'power2.out',
      });
    }, container);

    return () => ctx.revert();
  }, []);

  return containerRef;
}

// =============================================================================
// Login Page Background Animation
// =============================================================================

/**
 * Creates a subtle floating gradient animation on the login page
 * Animated orbs drift slowly behind the form
 */
export function useLoginBackground() {
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = gsap.context(() => {
      // Added: Animate floating orbs with infinite loop
      const orbs = canvas.querySelectorAll('[data-anim="login-orb"]');
      orbs.forEach((orb, i) => {
        gsap.to(orb, {
          x: `random(-80, 80)`,
          y: `random(-60, 60)`,
          scale: `random(0.8, 1.3)`,
          duration: `random(8, 14)`,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 1.5,
        });
      });

      // Added: Form entrance
      gsap.from('[data-anim="login-form"]', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        delay: 0.2,
        ease: 'power3.out',
      });

      // Added: Side panel content entrance
      gsap.from('[data-anim="login-side"]', {
        x: -30,
        opacity: 0,
        duration: 0.8,
        delay: 0.1,
        ease: 'power2.out',
      });
    }, canvas);

    return () => ctx.revert();
  }, []);

  return canvasRef;
}

// =============================================================================
// Order Submission Celebration
// =============================================================================

/**
 * Triggers a celebration animation after successful order/invoice submission
 * Confetti-style burst with a success checkmark scale-in
 */
export function useSubmissionCelebration() {
  const containerRef = useRef<HTMLDivElement>(null);

  const celebrate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      // Added: Success icon scale-in with bounce
      gsap.from('[data-anim="success-icon"]', {
        scale: 0,
        rotation: -180,
        duration: 0.6,
        ease: 'back.out(2)',
      });

      // Added: Success message fade-in
      gsap.from('[data-anim="success-message"]', {
        y: 20,
        opacity: 0,
        duration: 0.4,
        delay: 0.3,
        ease: 'power2.out',
      });

      // Added: Confetti particles burst
      const particles = container.querySelectorAll('[data-anim="confetti"]');
      particles.forEach((p) => {
        gsap.fromTo(
          p,
          {
            x: 0,
            y: 0,
            scale: 0,
            opacity: 1,
          },
          {
            x: `random(-200, 200)`,
            y: `random(-250, -50)`,
            scale: `random(0.5, 1.5)`,
            rotation: `random(-360, 360)`,
            opacity: 0,
            duration: `random(0.8, 1.4)`,
            ease: 'power2.out',
          }
        );
      });
    }, container);

    // NOTE: cleanup after animation completes
    setTimeout(() => ctx.revert(), 2000);
  }, []);

  return { containerRef, celebrate };
}

// =============================================================================
// Stagger List Entrance
// =============================================================================

/**
 * Animates list/table rows with a staggered entrance
 * Useful for invoice lists, transaction tables, etc.
 */
export function useStaggerEntrance(deps: unknown[] = []) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-anim="list-item"]', {
        y: 20,
        opacity: 0,
        duration: 0.35,
        stagger: 0.05,
        ease: 'power2.out',
      });
    }, list);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return listRef;
}

// =============================================================================
// Page Transition
// =============================================================================

/**
 * Simple page-level fade-slide entrance for any page
 */
export function usePageEntrance() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const ctx = gsap.context(() => {
      gsap.from(page, {
        y: 15,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
      });
    });

    return () => ctx.revert();
  }, []);

  return pageRef;
}

// =============================================================================
// Number Counter Animation
// =============================================================================

/**
 * Animates a number counting up from 0 to target value
 * Used for KPI stat cards and financial totals
 */
export function useCountUp(
  targetValue: number,
  options: { duration?: number; delay?: number; decimals?: number } = {}
) {
  const ref = useRef<HTMLSpanElement>(null);
  const { duration = 1.2, delay = 0.3, decimals = 0 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || targetValue === 0) return;

    const obj = { val: 0 };
    const tween = gsap.to(obj, {
      val: targetValue,
      duration,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = obj.val.toFixed(decimals);
      },
    });

    return () => {
      tween.kill();
    };
  }, [targetValue, duration, delay, decimals]);

  return ref;
}
