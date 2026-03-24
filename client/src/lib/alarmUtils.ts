// Enhanced alarm utilities with robust scheduling and notification system  
import type { Alarm, InsertAlarm } from "@shared/schema";
import { audioManager } from "./audioManager";

// Browser notification manager
export class NotificationManager {
  private static instance: NotificationManager;
  private isPermissionGranted = false;

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("This browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      this.isPermissionGranted = true;
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    const permission = await Notification.requestPermission();
    this.isPermissionGranted = permission === "granted";
    return this.isPermissionGranted;
  }

  showNotification(title: string, options: NotificationOptions = {}): Notification | null {
    if (!this.isPermissionGranted) {
      console.warn("Notification permission not granted");
      return null;
    }

    const notification = new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      requireInteraction: true,
      ...options,
    });

    // Auto-close after 30 seconds if user doesn't interact
    setTimeout(() => {
      notification.close();
    }, 30000);

    return notification;
  }
}

// Alarm scheduler with precise timing
export class AlarmScheduler {
  private scheduledAlarms = new Map<number, NodeJS.Timeout>();
  private onAlarmTrigger?: (alarm: Alarm) => void;

  constructor(onTrigger?: (alarm: Alarm) => void) {
    this.onAlarmTrigger = onTrigger;
  }

  scheduleAlarm(alarm: Alarm): void {
    // Clear existing schedule for this alarm
    this.clearAlarm(alarm.id);

    const triggerTime = this.calculateNextTriggerTime(alarm);
    const now = new Date();
    const delay = triggerTime.getTime() - now.getTime();

    if (delay <= 0) {
      // Trigger immediately if time has passed
      this.triggerAlarm(alarm);
      return;
    }

    // Use setTimeout for delays up to 24 hours (to avoid integer overflow)
    const maxDelay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const actualDelay = Math.min(delay, maxDelay);

    const timeoutId = setTimeout(() => {
      this.triggerAlarm(alarm);
      
      // If this was a recurring alarm, schedule the next occurrence
      if (alarm.repeatType !== "none") {
        this.scheduleAlarm(alarm);
      }
    }, actualDelay);

    this.scheduledAlarms.set(alarm.id, timeoutId);

    console.log(`⏰ Alarm "${alarm.title}" scheduled for ${triggerTime.toLocaleString()}`);
  }

  clearAlarm(alarmId: number): void {
    const timeoutId = this.scheduledAlarms.get(alarmId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.scheduledAlarms.delete(alarmId);
    }
  }

  clearAllAlarms(): void {
    this.scheduledAlarms.forEach((timeoutId) => clearTimeout(timeoutId));
    this.scheduledAlarms.clear();
  }

  private triggerAlarm(alarm: Alarm): void {
    console.log(`🔔 Alarm triggered: ${alarm.title}`);
    
    // Play sound if enabled
    if (alarm.soundEnabled) {
      audioManager.playAlarm();
    }
    
    // Show notification
    const notificationManager = NotificationManager.getInstance();
    const notification = notificationManager.showNotification(alarm.title, {
      body: alarm.description || `Time for: ${alarm.title}`,
      tag: `alarm-${alarm.id}`,
      data: { alarmId: alarm.id },
    });

    // Handle notification clicks
    if (notification) {
      notification.onclick = () => {
        audioManager.stopAlarm();
        notification.close();
      };
    }

    // Call external trigger handler
    this.onAlarmTrigger?.(alarm);
  }

  private calculateNextTriggerTime(alarm: Alarm): Date {
    const now = new Date();
    const triggerTime = new Date(alarm.triggerTime);
    
    if (alarm.repeatType === "none") {
      return triggerTime;
    }
    
    // For repeating alarms, find next occurrence
    let nextTrigger = new Date(triggerTime);
    
    while (nextTrigger <= now) {
      switch (alarm.repeatType) {
        case "daily":
          nextTrigger.setDate(nextTrigger.getDate() + 1);
          break;
        case "weekly":
          nextTrigger.setDate(nextTrigger.getDate() + 7);
          break;
        case "monthly":
          nextTrigger.setMonth(nextTrigger.getMonth() + 1);
          break;
      }
    }
    
    return nextTrigger;
  }

  getScheduledAlarms(): number[] {
    return Array.from(this.scheduledAlarms.keys());
  }
}

// Enhanced natural language parser with better error handling
export function parseNaturalLanguage(input: string) {
  const lowerInput = input.toLowerCase().trim();
  
  if (!lowerInput) {
    return null;
  }

  // Check for Do Not Disturb commands
  const dndMatch = lowerInput.match(/(?:don't|do not|dont)\s+disturb\s+(?:for\s+)?(?:next\s+)?(\d+)\s+(minute|minutes|hour|hours|day|days)/i);
  if (dndMatch) {
    const amount = parseInt(dndMatch[1]);
    const unit = dndMatch[2].toLowerCase();
    
    return {
      isDND: true,
      amount,
      unit: unit.replace('s', ''),
      summary: `Do Not Disturb for ${amount} ${unit}`,
    };
  }
  
  // Extract task title with better cleaning
  const extractTaskTitle = (text: string): string => {
    const cleanedText = text
      .replace(/^(put\s+a\s+|set\s+a\s+|set\s+an\s+|create\s+a\s+)?(?:reminder|alarm|timer)\s+(for\s+)?/i, '')
      .replace(/\s+(to|for)\s+/i, ' ')
      .replace(/\s+in\s+\d+\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months)/i, '')
      .replace(/\s+(next|this|upcoming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)/i, '')
      .replace(/\s+at\s+\d{1,2}(:\d{2})?\s*(am|pm)?/i, '')
      .replace(/\s+every\s+(day|morning|evening|night|week|month)/i, '')
      .trim();
    
    if (cleanedText && !cleanedText.match(/^(alarm|timer|reminder)$/i)) {
      return cleanedText.charAt(0).toUpperCase() + cleanedText.slice(1);
    }
    
    return 'Reminder';
  };
  
  // Enhanced notification messages
  const generateNotificationMessage = (title: string): string => {
    const taskLower = title.toLowerCase();
    
    const messageMap: Record<string, string> = {
      water: '💧 Time to hydrate! Your body will thank you.',
      exercise: '🏃 Time to get moving! Your fitness goals await.',
      work: '📚 Time to focus! You\'ve got this.',
      meeting: '📞 Time for your scheduled engagement!',
      medicine: '💊 Time to take your medication. Health first!',
      break: '☕ Time for a well-deserved break!',
      food: '🍽️ Time to nourish your body!',
      sleep: '😴 Time to rest and recharge!',
    };
    
    for (const [keyword, message] of Object.entries(messageMap)) {
      if (taskLower.includes(keyword)) {
        return message;
      }
    }
    
    return `⏰ Time for: ${title}! Stay productive.`;
  };
  
  // Parse relative time (e.g., "in 5 minutes")
  const relativeTimeMatch = lowerInput.match(/(?:in\s+)?(\d+)\s+(minute|minutes|hour|hours|min|mins)(?:\s+from\s+now)?/i);
  if (relativeTimeMatch) {
    const amount = parseInt(relativeTimeMatch[1]);
    const unit = relativeTimeMatch[2].toLowerCase();
    
    const now = new Date();
    const targetTime = new Date(now);
    
    if (unit.includes('hour')) {
      targetTime.setHours(targetTime.getHours() + amount);
    } else {
      targetTime.setMinutes(targetTime.getMinutes() + amount);
    }
    
    const extractedTitle = extractTaskTitle(input);
    
    return {
      title: extractedTitle,
      description: generateNotificationMessage(extractedTitle),
      triggerTime: targetTime,
      repeatType: "none" as const,
      repeatValue: null,
      summary: `Timer: ${extractedTitle} - In ${amount} ${unit}`,
    };
  }
  
  // Parse absolute time
  const timeMatch = lowerInput.match(/(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (!timeMatch) {
    return null; // No time specified
  }
  
  let hours = parseInt(timeMatch[1]);
  const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
  const ampm = timeMatch[3];
  
  if (ampm === "pm" && hours !== 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  
  const title = extractTaskTitle(input);
  const today = new Date();
  
  // Parse date and repeat patterns
  let targetDate = new Date(today);
  let repeatType: "none" | "daily" | "weekly" | "monthly" = "none";
  let summary = "";
  
  // Check for specific patterns
  if (lowerInput.includes("tomorrow")) {
    targetDate.setDate(today.getDate() + 1);
    summary = `Alarm: ${title} - Tomorrow at ${formatTime(hours, minutes)}`;
  } else if (lowerInput.includes("every day") || lowerInput.includes("daily")) {
    repeatType = "daily";
    summary = `Alarm: ${title} - Daily at ${formatTime(hours, minutes)}`;
  } else if (lowerInput.includes("every week") || lowerInput.includes("weekly")) {
    repeatType = "weekly";
    summary = `Alarm: ${title} - Weekly at ${formatTime(hours, minutes)}`;
  } else if (lowerInput.includes("every month") || lowerInput.includes("monthly")) {
    repeatType = "monthly";
    summary = `Alarm: ${title} - Monthly at ${formatTime(hours, minutes)}`;
  } else {
    // Check for weekdays
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekdayMatch = lowerInput.match(/(?:next|upcoming|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
    
    if (weekdayMatch) {
      const targetWeekday = weekdayMatch[1].toLowerCase();
      const targetDayIndex = weekdays.indexOf(targetWeekday);
      const currentDayIndex = today.getDay();
      
      let daysToAdd = targetDayIndex - currentDayIndex;
      if (daysToAdd <= 0) daysToAdd += 7;
      
      targetDate.setDate(today.getDate() + daysToAdd);
      const dayName = targetWeekday.charAt(0).toUpperCase() + targetWeekday.slice(1);
      summary = `Alarm: ${title} - ${dayName} at ${formatTime(hours, minutes)}`;
    } else {
      // Default to today if time hasn't passed, otherwise tomorrow
      const todayAtTime = new Date(today);
      todayAtTime.setHours(hours, minutes, 0, 0);
      
      if (todayAtTime > today) {
        targetDate = todayAtTime;
        summary = `Alarm: ${title} - Today at ${formatTime(hours, minutes)}`;
      } else {
        targetDate.setDate(today.getDate() + 1);
        summary = `Alarm: ${title} - Tomorrow at ${formatTime(hours, minutes)}`;
      }
    }
  }
  
  // Set the time
  targetDate.setHours(hours, minutes, 0, 0);
  
  return {
    title,
    description: generateNotificationMessage(title),
    triggerTime: targetDate,
    repeatType,
    repeatValue: null,
    summary,
  };
}

// Utility functions
function formatTime(hours: number, minutes: number): string {
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export function formatTimeRemaining(triggerTime: Date | string): string {
  const trigger = new Date(triggerTime);
  const now = new Date();
  const diff = trigger.getTime() - now.getTime();
  
  if (diff <= 0) return "Now";
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Snooze functionality
export function createSnoozeAlarm(originalAlarm: Alarm, snoozeMinutes: number = 5): InsertAlarm {
  const snoozeTime = new Date();
  snoozeTime.setMinutes(snoozeTime.getMinutes() + snoozeMinutes);
  
  return {
    title: `${originalAlarm.title} (Snoozed)`,
    description: originalAlarm.description,
    triggerTime: snoozeTime,
    repeatType: "none", // Snoozed alarms don't repeat
    repeatValue: null,
    soundEnabled: originalAlarm.soundEnabled,
    isActive: true,
  };
}

// Validation helpers
export function validateAlarmTime(triggerTime: Date): { isValid: boolean; error?: string } {
  const now = new Date();
  
  if (triggerTime <= now) {
    return { isValid: false, error: "Alarm time must be in the future" };
  }
  
  // Check if alarm is more than 1 year in the future
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  
  if (triggerTime > oneYearFromNow) {
    return { isValid: false, error: "Alarm cannot be set more than 1 year in the future" };
  }
  
  return { isValid: true };
}