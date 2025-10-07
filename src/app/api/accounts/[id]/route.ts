import { deleteAccount, getAccountById, updateAccount } from '@/models/account';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await getAccountById(params.id);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Remove sensitive data
    const safeAccount = {
      ...account,
      apiSecret: undefined,
      accessToken: account.accessToken ? '***' : undefined,
    };

    return NextResponse.json({ success: true, account: safeAccount });
  } catch (error) {
    console.error('Error fetching account:', error);
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { accountName, apiKey, apiSecret, isActive, metadata } = body;

    const updates: any = {};
    if (accountName !== undefined) updates.accountName = accountName;
    if (apiKey !== undefined) updates.apiKey = apiKey;
    if (apiSecret !== undefined) updates.apiSecret = apiSecret;
    if (isActive !== undefined) updates.isActive = isActive;
    if (metadata !== undefined) updates.metadata = metadata;

    const updatedAccount = await updateAccount(params.id, updates);

    if (!updatedAccount) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Remove sensitive data
    const safeAccount = {
      ...updatedAccount,
      apiSecret: undefined,
    };

    return NextResponse.json({
      success: true,
      account: safeAccount,
      message: 'Account updated successfully',
    });
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { accountName, apiKey, apiSecret, metadata } = body;

    const updates: any = {};

    // Only update provided fields
    if (accountName !== undefined) updates.accountName = accountName;
    if (apiKey !== undefined) updates.apiKey = apiKey;
    if (apiSecret !== undefined) updates.apiSecret = apiSecret;
    if (metadata !== undefined) updates.metadata = metadata;

    const updatedAccount = await updateAccount(params.id, updates);

    if (!updatedAccount) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Remove sensitive data
    const safeAccount = {
      ...updatedAccount,
      apiSecret: undefined,
      accessToken: updatedAccount.accessToken ? '***' : undefined,
    };

    return NextResponse.json({
      success: true,
      account: safeAccount,
      message: 'Account updated successfully',
    });
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const success = await deleteAccount(params.id);

    if (!success) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
