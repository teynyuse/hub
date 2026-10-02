"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Mail,
  Wallet,
  CalendarDays,
  ListTodo,
  FileText,
  Folder,
  Settings,
} from "lucide-react";
const items = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/space", label: "Space", icon: FileText },
  { href: "/files", label: "Files", icon: Folder },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function Sidebar({ name }: { name: string }) {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/home" className="brand">
        Hub
      </Link>
      <nav aria-label="Hoofdmenu">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={path === href || path.startsWith(href + "/") ? "active" : ""}
            aria-current={path === href || path.startsWith(href + "/") ? "page" : undefined}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
      <span className="sidebar-user">{name || "Mijn account"}</span>
    </aside>
  );
}
