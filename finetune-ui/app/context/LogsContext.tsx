"use client";

import React, { createContext, useContext, useState } from "react";

export type ServiceType = "backend" | "frontend";

interface LogsContextType {
  isOpen: boolean;
  activeService: ServiceType | null;
  openLogsPanel: (service: ServiceType) => void;
  closeLogsPanel: () => void;
  toggleLogsPanel: (service: ServiceType) => void;
}

const LogsContext = createContext<LogsContextType | undefined>(undefined);

export function LogsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeService, setActiveService] = useState<ServiceType | null>(null);

  const openLogsPanel = (service: ServiceType) => {
    setActiveService(service);
    setIsOpen(true);
  };

  const closeLogsPanel = () => {
    setIsOpen(false);
  };

  const toggleLogsPanel = (service: ServiceType) => {
    if (isOpen && activeService === service) {
      setIsOpen(false);
    } else {
      setActiveService(service);
      setIsOpen(true);
    }
  };

  return (
    <LogsContext.Provider
      value={{
        isOpen,
        activeService,
        openLogsPanel,
        closeLogsPanel,
        toggleLogsPanel,
      }}
    >
      {children}
    </LogsContext.Provider>
  );
}

export function useLogs() {
  const context = useContext(LogsContext);
  if (context === undefined) {
    throw new Error("useLogs must be used within a LogsProvider");
  }
  return context;
}
