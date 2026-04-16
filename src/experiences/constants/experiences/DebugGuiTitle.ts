export const DebugGuiTitle = {
    THREE_RENDERER: 'Three Renderer',
    THREE_COMPOSERS: 'Three Composers',
    THREE_VIEWS: 'Three Views',
    WINDLINES: 'Windlines',
    PORTAIL_ASCII: 'Portail ASCII',
} as const;

export type DebugGuiTitle = (typeof DebugGuiTitle)[keyof typeof DebugGuiTitle];
