// src/contexts/ModalContext.tsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import AppModal, { type ModalOptions } from '../comps/AppModal';

interface ModalContextValue {
    alert: (message: string, title?: string) => Promise<void>;
    confirm: (message: string, title?: string) => Promise<boolean>;
    custom: (options: ModalOptions) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const [options, setOptions] = useState<ModalOptions | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const close = useCallback(() => {
        setOptions(null);
        resolveRef.current = null;
    }, []);

    const alert = useCallback((message: string, title?: string): Promise<void> => {
        return new Promise((resolve) => {
            setOptions({
                title,
                message,
                buttons: [
                    {
                        label: 'אישור',
                        variant: 'primary',
                        onClick: () => { close(); resolve(); },
                    },
                ],
            });
        });
    }, [close]);

    const confirm = useCallback((message: string, title?: string): Promise<boolean> => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setOptions({
                title,
                message,
                buttons: [
                    {
                        label: 'אישור',
                        variant: 'primary',
                        onClick: () => { close(); resolve(true); },
                    },
                    {
                        label: 'ביטול',
                        variant: 'secondary',
                        onClick: () => { close(); resolve(false); },
                    },
                ],
            });
        });
    }, [close]);

    const custom = useCallback((opts: ModalOptions) => {
        setOptions(opts);
    }, []);

    return (
        <ModalContext.Provider value={{ alert, confirm, custom }}>
            {children}
            <AppModal options={options} />
        </ModalContext.Provider>
    );
}

export function useModal(): ModalContextValue {
    const ctx = useContext(ModalContext);
    if (!ctx) throw new Error('useModal must be used inside ModalProvider');
    return ctx;
}

