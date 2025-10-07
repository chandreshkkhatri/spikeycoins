import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Handle logout
 * For this trading app, logout primarily clears any session state
 * Individual trading accounts maintain their own authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Clear any session cookies if they exist
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    // Clear any authentication cookies
    // (If you had session cookies, you would clear them here)
    // response.cookies.delete('session');

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Logout failed',
      },
      { status: 500 }
    );
  }
}
