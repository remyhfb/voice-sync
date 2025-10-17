import { Mic, Upload, FolderOpen, Settings, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const menuItems = [
  {
    title: "Create",
    url: "/",
    icon: Upload,
    testId: "link-create",
  },
  {
    title: "Voice Library",
    url: "/voices",
    icon: Mic,
    testId: "link-voices",
  },
  {
    title: "Projects",
    url: "/projects",
    icon: FolderOpen,
    testId: "link-projects",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    testId: "link-settings",
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">VoiceSwap</h1>
            <p className="text-xs text-muted-foreground">AI Voice Cloning</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workflow</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} data-testid={item.testId}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Powered by ElevenLabs
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
