import { BookOpen, CircleHelp, LifeBuoy, ShieldCheck } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";

export function HelpMenu() {
  const router = useRouter();
  const toast = useToast();
  return (
    <Menu
      label="Help"
      trigger={
        <IconButton label="Help" className="hidden sm:inline-grid">
          <CircleHelp className="size-[18px]" />
        </IconButton>
      }
      items={[
        { label: "How Pramaan works", icon: <BookOpen />, onSelect: () => router.push("/#how-it-works") },
        { label: "Security & privacy", icon: <ShieldCheck />, onSelect: () => router.push("/#trust") },
        "separator",
        { label: "Contact support", icon: <LifeBuoy />, onSelect: () => toast({ title: "Support request started", description: "We usually reply within a day.", tone: "info" }) },
      ]}
    />
  );
}
