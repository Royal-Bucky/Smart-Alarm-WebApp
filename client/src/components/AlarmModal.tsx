import { useEffect, useState } from "react";
import { Bell, Clock, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAlarms } from "@/hooks/useAlarms";
import { audioManager } from "@/lib/audioManager";
import { useToast } from "@/hooks/use-toast";

interface TriggeredAlarm {
  id: number;
  title: string;
  description?: string | null;
  triggerTime: Date;
}

export function AlarmModal() {
  const [triggeredAlarm, setTriggeredAlarm] = useState<TriggeredAlarm | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { alarms, deleteAlarm, updateAlarm } = useAlarms();
  const { toast } = useToast();

  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      
      // Skip if we already have a triggered alarm to avoid multiple alarms
      if (triggeredAlarm) return;
      
      // Check if Do Not Disturb is active
      const dndEndTime = localStorage.getItem('dndEndTime');
      if (dndEndTime) {
        const endTime = new Date(dndEndTime);
        if (endTime > now) {
          // DND is active, skip all alarm checks
          return;
        }
      }
      
      for (const alarm of alarms) {
        const triggerTime = new Date(alarm.triggerTime);
        const timeDiff = triggerTime.getTime() - now.getTime();
        
        // Trigger if time has passed or within 5 seconds
        if (timeDiff <= 5000 && timeDiff > -30000) {
          setTriggeredAlarm({
            id: alarm.id,
            title: alarm.title,
            description: alarm.description,
            triggerTime: triggerTime,
          });
          setIsOpen(true);
          
          // Start audio notification - this will keep buzzing until stopped
          if (alarm.soundEnabled) {
            audioManager.playAlarm();
          }
          
          // Show browser notification
          if (Notification.permission === "granted") {
            new Notification(alarm.title || "Alarm!", {
              body: alarm.description || `Time for: ${alarm.title}`,
              icon: "/favicon.ico",
            });
          }
          
          break;
        }
      }
    };

    // Check immediately
    checkAlarms();

    // Check every second
    const interval = setInterval(checkAlarms, 1000);

    return () => clearInterval(interval);
  }, [alarms, triggeredAlarm]);

  useEffect(() => {
    // Request notification permission on component mount
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handleDismiss = async () => {
    if (triggeredAlarm) {
      audioManager.stopAlarm();
      
      // For non-repeating alarms, delete them after triggering
      const alarm = alarms.find((a: { id: number; }) => a.id === triggeredAlarm.id);
      if (alarm && alarm.repeatType === "none") {
        await deleteAlarm(triggeredAlarm.id);
      }
    }
    
    setIsOpen(false);
    setTriggeredAlarm(null);
  };

  const handleSnooze = async () => {
    if (triggeredAlarm) {
      audioManager.stopAlarm();
      
      // Create a new alarm 10 minutes from now
      const snoozeTime = new Date();
      snoozeTime.setMinutes(snoozeTime.getMinutes() + 10);
      
      const alarm = alarms.find((a: { id: number; }) => a.id === triggeredAlarm.id);
      if (alarm) {
        // Update the alarm with the new snooze time
        await updateAlarm({
          id: alarm.id,
          triggerTime: snoozeTime,
        });
      }
    }
    
    setIsOpen(false);
    setTriggeredAlarm(null);
    
    toast({
      title: "Snoozed",
      description: "Alarm snoozed for 10 minutes",
    });
  };

  if (!triggeredAlarm) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md border-4 border-accent animate-pulse" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center text-2xl">
            <Bell className="w-8 h-8 text-accent mr-3 animate-bounce" />
            ⏰ Alarm!
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-accent rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
            <Clock className="w-8 h-8 text-white" />
          </div>
          
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {triggeredAlarm.title}
          </h3>
          {triggeredAlarm.description && (
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
              {triggeredAlarm.description}
            </p>
          )}
          
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            <p>{triggeredAlarm.triggerTime.toLocaleString()}</p>
          </div>
          
          <div className="flex space-x-3">
            <Button
              onClick={handleDismiss}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              <X className="w-4 h-4 mr-2" />
              Dismiss
            </Button>
            <Button
              onClick={handleSnooze}
              variant="outline"
              className="flex-1 bg-accent hover:bg-accent/90 text-white border-accent"
            >
              <Clock className="w-4 h-4 mr-2" />
              Snooze 10m
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
