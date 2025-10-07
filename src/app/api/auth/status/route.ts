import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Check authentication status
 * For this trading app, we primarily use offline mode and account-specific authentication
 * This endpoint provides a simple status check that defaults to offline access
 */
export async function GET(request: NextRequest) {
  try {
    // For this trading-focused app, we don't have traditional user sessions
    // Instead, we check if the user has configured accounts and allow offline access

    // You could extend this to check for:
    // - Valid session cookies
    // - JWT tokens
    // - Account authentication status

    // For now, return a status that allows offline access
    return NextResponse.json({
      isLoggedIn: false, // No traditional login system
      allowOfflineAccess: true, // Always allow offline access
      login_url: null, // No single login URL - accounts handle their own auth
      message: 'Offline mode available. Authenticate individual accounts as needed.',
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    return NextResponse.json(
      {
        isLoggedIn: false,
        allowOfflineAccess: true, // Fallback to offline mode
        login_url: null,
        error: 'Failed to check auth status, allowing offline access',
      },
      { status: 200 } // Return 200 to avoid auth context errors
    );
  }
}
