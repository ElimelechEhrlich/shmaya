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
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const close = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setOptions(null);
        resolveRef.current = null;
    }, []);

    const alert = useCallback((message: string, title?: string, autoCloseMs?: number): Promise<void> => {
        return new Promise((resolve) => {
            setOptions({
                title, message, autoCloseMs,
                buttons: [{ label: 'אישור', variant: 'primary', onClick: () => { close(); resolve(); } }],
            });
            if (autoCloseMs) {
                timerRef.current = setTimeout(() => { close(); resolve(); }, autoCloseMs);
            }
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
    const wrappedButtons = opts.buttons.map(btn => ({
        ...btn,
        onClick: () => {
            close();
            btn.onClick();
        }
    }));
    setOptions({ ...opts, buttons: wrappedButtons });
}, [close]);

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

