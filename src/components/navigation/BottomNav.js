"use client";

import {
  Home,
  Target,
  PlusCircle,
  MessageCircle,
  User,
} from "lucide-react";

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">

      <div className="mx-auto flex h-20 max-w-md items-center justify-around">

        <button className="flex flex-col items-center gap-1 text-emerald-400">
          <Home size={24} />
          <span className="text-xs">Home</span>
        </button>

        <button className="flex flex-col items-center gap-1 text-zinc-500">
          <Target size={24} />
          <span className="text-xs">Goals</span>
        </button>

        <button className="-mt-10 rounded-full bg-emerald-500 p-5 text-black shadow-2xl">
          <PlusCircle size={30} />
        </button>

        <button className="flex flex-col items-center gap-1 text-zinc-500">
          <MessageCircle size={24} />
          <span className="text-xs">Coach</span>
        </button>

        <button className="flex flex-col items-center gap-1 text-zinc-500">
          <User size={24} />
          <span className="text-xs">Profile</span>
        </button>

      </div>

    </nav>
  );
}