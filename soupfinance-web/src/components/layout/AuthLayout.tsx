/**
 * Auth Layout Component
 * Used for login/registration pages
 * Split-screen design with professional imagery and testimonial
 * Reference: soupfinance-designs/login-authentication/
 */
import { Outlet } from 'react-router-dom';
import { Logo } from '../Logo';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex bg-background-light dark:bg-background-dark">
      {/* Left: Branding Panel with Professional Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background Image - Professional Black woman at laptop */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1920')`,
          }}
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/70 to-[#221510]/90" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-white">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Logo variant="mark" size={48} />
            <h1 className="text-2xl font-bold text-white">
              <span>Soup</span>
              <span className="text-white/90">Finance</span>
            </h1>
          </div>

          {/* Main Message */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-black tracking-tight mb-4">
                Financial clarity,
                <br />
                simplified.
              </h2>
              <p className="text-lg text-white/80 max-w-md">
                Professional invoicing and accounting for growing businesses.
                Manage your finances with confidence.
              </p>
            </div>

            {/* Testimonial */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 max-w-md border border-white/10">
              <p className="text-base italic text-white/90 mb-4">
                "SoupFinance transformed how we manage our receivables. What used to take days now takes minutes. The reporting features alone have saved us countless hours."
              </p>
              <div className="flex items-center gap-3">
                <img
                  src="https://images.pexels.com/photos/2381069/pexels-photo-2381069.jpeg?auto=compress&cs=tinysrgb&w=100"
                  alt="Michael Okonkwo"
                  className="w-12 h-12 rounded-full object-cover border-2 border-white/30"
                />
                <div>
                  <p className="font-semibold">Michael Okonkwo</p>
                  <p className="text-sm text-white/70">CFO, Nexus Holdings Ltd</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Signals */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-white/70">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">verified_user</span>
              Bank-grade Security
            </span>
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">groups</span>
              2,500+ Teams
            </span>
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">lock</span>
              256-bit SSL
            </span>
          </div>
        </div>
      </div>

      {/* Right: Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
