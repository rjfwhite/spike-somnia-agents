"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
    LayoutGrid,
    Activity,
    PlusCircle,
    Menu,
    X,
    BookOpen,
    Zap,
    Settings,
    User,
    FileText,
    Users,
    Box,
    Send,
    Globe
} from "lucide-react";
import { useNetwork } from "@/lib/network-context";
import { NETWORKS, type NetworkKey } from "@/lib/networks";
export function AppShell({ children }: { children: React.ReactNode }) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const pathname = usePathname();
    const { networkKey, setNetwork } = useNetwork();

    const navItems = [
        { id: 'agents', label: 'Agents', icon: LayoutGrid, path: '/' },
        { id: 'my-agents', label: 'My Agents', icon: User, path: '/my-agents' },
        { id: 'live', label: 'Live Feed', icon: Activity, path: '/live' },
        { id: 'admin', label: 'Admin', icon: Settings, path: '/admin' },
        { id: 'invoke', label: 'Direct Invoke', icon: Zap, path: '/invoke' },
        { id: 'docs', label: 'Documentation', icon: BookOpen, path: 'https://metaversal.gitbook.io/agents/s8KLL5NzoS6LwJVIQCiT/', external: true },
    ];

    const v2NavItems = [
        { id: 'agents-v2', label: 'Agents', icon: Box, path: '/agents-v2' },
        { id: 'requests-v2', label: 'Requests', icon: Send, path: '/requests-v2' },
        { id: 'receipts', label: 'Receipts', icon: FileText, path: '/receipts' },
        { id: 'committee', label: 'Committee', icon: Users, path: '/committee' },
    ];

    return (
        <div className="flex h-screen bg-black overflow-hidden relative">
            {/* Background Ambience */}
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black pointer-events-none" />

            {/* Sidebar for Desktop */}
            <aside className="hidden md:flex flex-col w-64 bg-slate-950/50 border-r border-white/5 backdrop-blur-xl z-20">
                <div className="p-6 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg group-hover:shadow-blue-500/20 transition-all duration-300">
                                <span className="text-xl font-bold text-white">S</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-black"></div>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white tracking-tight">Somnia</h1>
                            <p className="text-xs text-blue-400 font-medium">Agent Platform</p>
                        </div>
                    </Link>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-2">Menu</div>
                    {navItems.map((item) => {
                        const isActive = !item.external && pathname === item.path;
                        const Icon = item.icon;
                        const linkClass = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive
                            ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                        }`;
                        const content = (
                            <>
                                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                <span className="font-medium">{item.label}</span>
                                {isActive && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                                )}
                            </>
                        );
                        return item.external ? (
                            <a
                                key={item.id}
                                href={item.path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={linkClass}
                            >
                                {content}
                            </a>
                        ) : (
                            <Link
                                key={item.id}
                                href={item.path}
                                className={linkClass}
                            >
                                {content}
                            </Link>
                        );
                    })}

                    {/* Agents v2 Section */}
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-8 mb-4 px-2">Agents v2</div>
                    {v2NavItems.map((item) => {
                        const isActive = pathname === item.path;
                        const Icon = item.icon;
                        const linkClass = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive
                            ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20 shadow-[0_0_15px_rgba(147,51,234,0.1)]'
                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                        }`;
                        return (
                            <Link
                                key={item.id}
                                href={item.path}
                                className={linkClass}
                            >
                                <Icon className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                <span className="font-medium">{item.label}</span>
                                {isActive && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]"></div>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Network Switcher */}
                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Network</span>
                    </div>
                    <div className="flex gap-1">
                        {(Object.keys(NETWORKS) as NetworkKey[]).map((key) => {
                            const isActive = networkKey === key;
                            const dotColor = key === "testnet" ? "bg-green-500" : "bg-orange-500";
                            return (
                                <button
                                    key={key}
                                    onClick={() => !isActive && setNetwork(key)}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                        isActive
                                            ? "bg-white/10 text-white border border-white/20"
                                            : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${dotColor} ${isActive ? "shadow-[0_0_6px]" : "opacity-50"}`}
                                        style={isActive ? { boxShadow: `0 0 6px ${key === "testnet" ? "#22c55e" : "#f97316"}` } : {}}
                                    />
                                    {NETWORKS[key].name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
                    <div className="flex items-center gap-4 md:hidden">
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="p-2 text-gray-400 hover:text-white"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <span className="font-bold text-white">Somnia Agents</span>
                    </div>

                    <div className="hidden md:block" />

                    <div className="flex items-center gap-4">
                        <ConnectButton
                            accountStatus={{
                                smallScreen: 'avatar',
                                largeScreen: 'full',
                            }}
                        />
                    </div>
                </header>

                {/* Page Content Scrollable Area */}
                <div className="flex-1 overflow-y-auto bg-transparent scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {children}
                    </div>
                </div>
            </main>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 md:hidden bg-black/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
                    <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-white/10 p-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <span className="text-xl font-bold text-white">Menu</span>
                            <button onClick={() => setMobileMenuOpen(false)}><X className="w-6 h-6 text-gray-400" /></button>
                        </div>
                        <nav className="space-y-2">
                            {navItems.map(item => {
                                const isActive = !item.external && pathname === item.path;
                                const linkClass = `flex items-center gap-3 px-4 py-3 rounded-lg ${isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400'}`;
                                const content = (
                                    <>
                                        <item.icon className="w-5 h-5" />
                                        {item.label}
                                    </>
                                );
                                return item.external ? (
                                    <a
                                        key={item.id}
                                        href={item.path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={linkClass}
                                    >
                                        {content}
                                    </a>
                                ) : (
                                    <Link
                                        key={item.id}
                                        href={item.path}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={linkClass}
                                    >
                                        {content}
                                    </Link>
                                );
                            })}

                            {/* Agents v2 Section */}
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-6 mb-2 px-4">Agents v2</div>
                            {v2NavItems.map(item => {
                                const isActive = pathname === item.path;
                                const linkClass = `flex items-center gap-3 px-4 py-3 rounded-lg ${isActive ? 'bg-purple-600/20 text-purple-400' : 'text-gray-400'}`;
                                return (
                                    <Link
                                        key={item.id}
                                        href={item.path}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={linkClass}
                                    >
                                        <item.icon className="w-5 h-5" />
                                        {item.label}
                                    </Link>
                                );
                            })}

                            {/* Mobile Network Switcher */}
                            <div className="mt-6 pt-4 border-t border-white/10">
                                <div className="flex items-center gap-2 mb-2 px-4">
                                    <Globe className="w-4 h-4 text-gray-500" />
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Network</span>
                                </div>
                                <div className="flex gap-1 px-4">
                                    {(Object.keys(NETWORKS) as NetworkKey[]).map((key) => {
                                        const isActive = networkKey === key;
                                        const dotColor = key === "testnet" ? "bg-green-500" : "bg-orange-500";
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => !isActive && setNetwork(key)}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                    isActive
                                                        ? "bg-white/10 text-white border border-white/20"
                                                        : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                                                }`}
                                            >
                                                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                                                {NETWORKS[key].name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </nav>
                    </div>
                </div>
            )}
        </div>
    );
}
