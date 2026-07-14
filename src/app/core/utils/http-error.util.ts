import { HttpErrorResponse } from '@angular/common/http';

/** Extracts a user-facing message from a `problem+json` error response. */
export function extractErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
        const title = (error.error as { title?: string } | null)?.title;
        if (title) {
            return title;
        }
    }
    return fallback;
}
