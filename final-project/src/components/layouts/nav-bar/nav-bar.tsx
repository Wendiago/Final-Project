"use client";
import LogoutButton from "@/app/(auth)/_components/logout-button";
import { Popcorn } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function NavBar() {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
  return (
    <nav
      className={`lg:px-16 fixed top-0 z-50 flex justify-between items-center py-4 w-full transition-all duration-1000 ease-in-out ${
        isScrolled ? "bg-foreground/70 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="w-full flex justify-between items-center">
        <Link href="/home" className="flex gap-1 text-2xl">
          <Popcorn className="text-primary size-8" />
          <p className="font-bold text-primary">WENDIAGO MOVIE</p>
        </Link>
        <LogoutButton />
      </div>
    </nav>
  );
}
