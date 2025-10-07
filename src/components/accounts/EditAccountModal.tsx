'use client';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { IAccount } from '@/models/account';
import { useEffect, useState } from 'react';

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: IAccount | null;
  onSave: (accountId: string, updates: Partial<IAccount>) => Promise<void>;
}

export default function EditAccountModal({
  isOpen,
  onClose,
  account,
  onSave,
}: EditAccountModalProps) {
  const [formData, setFormData] = useState({
    accountName: '',
    apiKey: '',
    apiSecret: '',
    isSandbox: false,
    isTestnet: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form when account changes
  useEffect(() => {
    if (account) {
      setFormData({
        accountName: account.accountName || '',
        apiKey: account.apiKey || '',
        apiSecret: '', // Don't show existing secret for security
        isSandbox: account.metadata?.sandbox === true,
        isTestnet: account.metadata?.testnet === true,
      });
    }
  }, [account]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.accountName.trim()) {
      newErrors.accountName = 'Account name is required';
    }

    if (!formData.apiKey.trim()) {
      newErrors.apiKey = 'API Key is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !account) return;

    setIsSubmitting(true);
    try {
      const updates: Partial<IAccount> = {
        accountName: formData.accountName.trim(),
        apiKey: formData.apiKey.trim(),
      };

      // Only update apiSecret if a new one was provided
      if (formData.apiSecret.trim()) {
        updates.apiSecret = formData.apiSecret.trim();
      }

      // Update metadata based on account type
      if (account.accountType === 'upstox') {
        updates.metadata = {
          ...account.metadata,
          sandbox: formData.isSandbox,
        };
      } else if (account.accountType === 'binance') {
        updates.metadata = {
          ...account.metadata,
          testnet: formData.isTestnet,
        };
      }

      await onSave(account._id!, updates);
      onClose();
    } catch (error) {
      console.error('Error updating account:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!account) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${account.accountName}`} size="medium">
      <form onSubmit={handleSubmit} className="edit-account-form">
        {/* Account Name */}
        <div className="form-group">
          <label htmlFor="accountName">Account Name *</label>
          <input
            id="accountName"
            type="text"
            value={formData.accountName}
            onChange={e => handleChange('accountName', e.target.value)}
            placeholder="Enter account name"
            className={`form-input ${errors.accountName ? 'error' : ''}`}
          />
          {errors.accountName && <span className="error-text">{errors.accountName}</span>}
        </div>

        {/* API Key */}
        <div className="form-group">
          <label htmlFor="apiKey">API Key *</label>
          <input
            id="apiKey"
            type="text"
            value={formData.apiKey}
            onChange={e => handleChange('apiKey', e.target.value)}
            placeholder="Your API Key"
            className={`form-input ${errors.apiKey ? 'error' : ''}`}
          />
          {errors.apiKey && <span className="error-text">{errors.apiKey}</span>}
        </div>

        {/* API Secret */}
        <div className="form-group">
          <label htmlFor="apiSecret">
            API Secret {formData.apiSecret ? '' : '(Leave empty to keep current)'}
          </label>
          <input
            id="apiSecret"
            type="password"
            value={formData.apiSecret}
            onChange={e => handleChange('apiSecret', e.target.value)}
            placeholder="Enter new API Secret to update"
            className="form-input"
          />
          <small className="form-help">
            For security, the current API Secret is not shown. Enter a new one only if you want to
            update it.
          </small>
        </div>

        {/* Environment Options */}
        {account.accountType === 'upstox' && (
          <div className="form-group">
            <div className="checkbox-group">
              <input
                id="sandbox"
                type="checkbox"
                checked={formData.isSandbox}
                onChange={e => handleChange('isSandbox', e.target.checked)}
                className="form-checkbox"
              />
              <label htmlFor="sandbox" className="checkbox-label">
                Use Sandbox Environment
              </label>
            </div>
            <small className="form-help">
              Enable this if you're using Upstox Sandbox API credentials.
            </small>
          </div>
        )}

        {account.accountType === 'binance' && (
          <div className="form-group">
            <div className="checkbox-group">
              <input
                id="testnet"
                type="checkbox"
                checked={formData.isTestnet}
                onChange={e => handleChange('isTestnet', e.target.checked)}
                className="form-checkbox"
              />
              <label htmlFor="testnet" className="checkbox-label">
                Use Testnet
              </label>
            </div>
            <small className="form-help">Enable this for testing with Binance Testnet.</small>
          </div>
        )}

        {/* Account Info */}
        <div className="account-info-section">
          <h4>Account Information</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Type:</span>
              <span className="info-value">{account.accountType.toUpperCase()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Status:</span>
              <span className={`info-value ${account.isActive ? 'active' : 'inactive'}`}>
                {account.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {account.accessToken && (
              <div className="info-item">
                <span className="info-label">Authentication:</span>
                <span className="info-value authenticated">Connected</span>
              </div>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <style jsx>{`
        .edit-account-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 6px;
          color: #333;
        }

        :global(.dark) .form-group label {
          color: #e5e5e5;
        }

        .form-input {
          padding: 8px 12px;
          border: 1px solid #e5e5e5;
          border-radius: 6px;
          font-size: 0.875rem;
          transition: all 0.2s;
          background: white;
          color: #333;
        }

        :global(.dark) .form-input {
          background: #27272a;
          border-color: #3f3f46;
          color: #e5e5e5;
        }

        .form-input:focus {
          outline: none;
          border-color: #2196f3;
          box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
        }

        .form-input.error {
          border-color: #dc2626;
        }

        .form-help {
          font-size: 0.75rem;
          color: #666;
          margin-top: 4px;
        }

        :global(.dark) .form-help {
          color: #a1a1aa;
        }

        .error-text {
          font-size: 0.75rem;
          color: #dc2626;
          margin-top: 4px;
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .form-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .checkbox-label {
          font-size: 0.875rem;
          cursor: pointer;
          user-select: none;
        }

        .account-info-section {
          padding: 16px;
          background: #f5f5f5;
          border-radius: 8px;
        }

        :global(.dark) .account-info-section {
          background: #27272a;
        }

        .account-info-section h4 {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 12px;
          color: #333;
        }

        :global(.dark) .account-info-section h4 {
          color: #e5e5e5;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .info-label {
          font-size: 0.75rem;
          color: #666;
        }

        :global(.dark) .info-label {
          color: #a1a1aa;
        }

        .info-value {
          font-size: 0.875rem;
          font-weight: 500;
          color: #333;
        }

        :global(.dark) .info-value {
          color: #e5e5e5;
        }

        .info-value.active {
          color: #059669;
        }

        .info-value.inactive {
          color: #dc2626;
        }

        .info-value.authenticated {
          color: #2196f3;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
          padding-top: 20px;
          border-top: 1px solid #e5e5e5;
        }

        :global(.dark) .form-actions {
          border-top-color: #3f3f46;
        }
      `}</style>
    </Modal>
  );
}
