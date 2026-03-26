"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSystemSettings } from '../store/storage';
import { useAuth } from './AuthContext';

interface ChatbotContextType {
  isChatbotEnabled: boolean;
  refreshSettings: () => Promise<void>;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export function ChatbotProvider({ children }: { children: React.ReactNode }) {
  const [isChatbotEnabled, setIsChatbotEnabled] = useState(false);
  const { user } = useAuth();

  async function refreshSettings() {
    try {
      // Prevent infinite loop: Only fetch if we have a token
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsChatbotEnabled(false);
        return;
      }

      const settings = await getSystemSettings();
      setIsChatbotEnabled(!!settings.chatbot_enabled);
    } catch (err) {
      console.error('Failed to fetch chatbot settings:', err);
    }
  }

  useEffect(() => {
    refreshSettings();
  }, [user]);

  return (
    <ChatbotContext.Provider value={{ isChatbotEnabled, refreshSettings }}>
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const context = useContext(ChatbotContext);
  if (context === undefined) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }
  return context;
}
