import { LandingLayout } from '../layouts/landing_layout.tsx'
import pkg from '../../../lockness/core/deno.json' with { type: 'json' }

export const HomeView = () => {
    return (
        <LandingLayout title="Welcome">
            <div class="w-full">
                {/* Navbar */}
                <header class="fixed w-full top-0 left-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
                    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-2xl font-bold text-blue-500">🌊 LOCKNESS</span>
                        </div>
                        <nav class="hidden md:flex items-center gap-8 font-medium">
                            <a href="#" class="hover:text-blue-400 transition-colors">Our Story</a>
                            <a href="#" class="hover:text-blue-400 transition-colors">Projects</a>
                            <a href="#" class="hover:text-blue-400 transition-colors">Services</a>
                            <a href="#" class="hover:text-blue-400 transition-colors">Studio</a>
                        </nav>
                        <button type="button" class="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-full font-semibold transition-all">
                            Contact Us
                        </button>
                    </div>
                </header>

                {/* Hero Section */}
                <section class="pt-32 pb-20 px-6">
                    <div class="max-w-6xl mx-auto text-center">
                        <div class="inline-block px-4 py-1.5 mb-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
                            New Release v${pkg.version}
                        </div>
                        <h1 class="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
                            Create beautiful, modern websites with <span class="text-blue-500">intuitive design tools</span>
                        </h1>
                        <p class="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                            Transform your ideas into stunning websites with our powerful, easy-to-use design platform. No coding required.
                        </p>
                        <div class="flex flex-wrap justify-center gap-4 mb-12">
                            <button type="button" class="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-500/20 transition-all">
                                Get Started
                            </button>
                            <button type="button" class="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-8 py-4 rounded-xl font-bold text-lg transition-all">
                                Watch Demo
                            </button>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer class="py-12 px-6 border-t border-slate-800 bg-slate-900">
                    <div class="max-w-6xl mx-auto flex flex-col items-center">
                        <div class="flex gap-6 mb-8 text-slate-400">
                            {/* Simple text icons for now */}
                            <a href="#" class="hover:text-blue-500 transition-colors">Instagram</a>
                            <a href="#" class="hover:text-blue-500 transition-colors">LinkedIn</a>
                            <a href="#" class="hover:text-blue-500 transition-colors">GitHub</a>
                        </div>
                        <div class="flex flex-wrap justify-center gap-8 mb-8 text-sm font-medium">
                            <a href="#" class="hover:text-white transition-colors">Portfolio</a>
                            <a href="#" class="hover:text-white transition-colors">About</a>
                            <a href="#" class="hover:text-white transition-colors">Contact</a>
                            <a href="#" class="hover:text-white transition-colors">Privacy</a>
                        </div>
                        <p class="text-slate-500 text-center">
                            © 2025 LOCKNESS JS Framework. All rights reserved.
                        </p>
                    </div>
                </footer>
            </div>
        </LandingLayout>
    )
}
