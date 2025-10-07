'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect, useState } from 'react';

interface RadixAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (accountData: {
    accountType: 'kite' | 'upstox' | 'binance';
    accountName: string;
    apiKey: string;
    apiSecret: string;
    redirectUri?: string;
  }) => void;
}

export default function RadixAccountModal({ isOpen, onClose, onSubmit }: RadixAccountModalProps) {
  const [step, setStep] = useState(1);
  const [selectedBroker, setSelectedBroker] = useState<'kite' | 'upstox' | 'binance' | null>(null);
  const [formData, setFormData] = useState({
    accountType: 'upstox' as 'kite' | 'upstox' | 'binance',
    accountName: '',
    apiKey: '',
    apiSecret: '',
    redirectUri: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const handleBrokerSelect = (brokerType: 'kite' | 'upstox' | 'binance') => {
    setSelectedBroker(brokerType);
    setFormData(prev => ({ ...prev, accountType: brokerType }));
    setStep(2);
  };

  const handleBackToSelection = () => {
    setStep(1);
    setSelectedBroker(null);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.accountName.trim()) newErrors.accountName = 'Account name is required';
    if (!formData.apiKey.trim()) newErrors.apiKey = 'API Key is required';
    if (!formData.apiSecret.trim()) newErrors.apiSecret = 'API Secret is required';

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        accountName: formData.accountName.trim(),
        apiKey: formData.apiKey.trim(),
        apiSecret: formData.apiSecret.trim(),
        ...(formData.redirectUri && { redirectUri: formData.redirectUri.trim() }),
      });

      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedBroker(null);
    setFormData({
      accountType: 'upstox',
      accountName: '',
      apiKey: '',
      apiSecret: '',
      redirectUri: '',
    });
    setErrors({});
  };

  const handleModalClose = () => {
    resetForm();
    onClose();
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const brokerOptions = [
    {
      id: 'kite',
      name: 'Zerodha Kite',
      description: "India's largest stock broker",
      icon: '🟢',
      available: true,
    },
    {
      id: 'upstox',
      name: 'Upstox',
      description: 'Technology-first discount broker',
      icon: '🟠',
      available: true,
    },
    {
      id: 'binance',
      name: 'Binance Futures',
      description: 'USD-M perpetual futures trading',
      icon: '🟡',
      available: true,
    },
  ];

  const getModalTitle = () => {
    if (step === 1) return 'Choose Trading Platform';
    return `Add ${selectedBroker === 'kite' ? 'Zerodha Kite' : selectedBroker === 'upstox' ? 'Upstox' : 'Binance Futures'} Account`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: isDark ? '#1e1e1e' : 'white',
          background: isDark ? '#1e1e1e' : 'white',
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{getModalTitle()}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6 p-6">
            <p className="text-center text-muted-foreground">
              Select which trading platform you'd like to connect:
            </p>

            <div className="grid gap-4">
              {brokerOptions.map(broker => (
                <div
                  key={broker.id}
                  className={`
                    p-6 border-2 rounded-lg cursor-pointer transition-all duration-200
                    hover:border-primary hover:shadow-md
                    ${!broker.available ? 'opacity-50 cursor-not-allowed bg-muted/50' : ''}
                  `}
                  onClick={() =>
                    broker.available &&
                    handleBrokerSelect(broker.id as 'kite' | 'upstox' | 'binance')
                  }
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">{broker.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{broker.name}</h3>
                      <p className="text-muted-foreground text-sm">{broker.description}</p>
                    </div>
                    {!broker.available && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <span className="text-2xl">
                {brokerOptions.find(b => b.id === selectedBroker)?.icon}
              </span>
              <div>
                <h4 className="font-medium">
                  {brokerOptions.find(b => b.id === selectedBroker)?.name}
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToSelection}
                  className="p-0 h-auto text-primary hover:text-primary/80"
                >
                  ← Change Platform
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Account Name *</label>
                <input
                  type="text"
                  value={formData.accountName}
                  onChange={e => handleChange('accountName', e.target.value)}
                  placeholder={`e.g., My ${selectedBroker === 'kite' ? 'Kite' : selectedBroker === 'upstox' ? 'Upstox' : 'Binance'} Account`}
                  className={`
                    w-full px-3 py-2 border rounded-md bg-background
                    ${errors.accountName ? 'border-destructive' : 'border-input'}
                    focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
                  `}
                />
                {errors.accountName && (
                  <p className="text-destructive text-sm mt-1">{errors.accountName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">API Key *</label>
                <input
                  type="text"
                  value={formData.apiKey}
                  onChange={e => handleChange('apiKey', e.target.value)}
                  placeholder="Your API Key"
                  className={`
                    w-full px-3 py-2 border rounded-md bg-background
                    ${errors.apiKey ? 'border-destructive' : 'border-input'}
                    focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
                  `}
                />
                {errors.apiKey && <p className="text-destructive text-sm mt-1">{errors.apiKey}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">API Secret *</label>
                <input
                  type="password"
                  value={formData.apiSecret}
                  onChange={e => handleChange('apiSecret', e.target.value)}
                  placeholder="Your API Secret"
                  className={`
                    w-full px-3 py-2 border rounded-md bg-background
                    ${errors.apiSecret ? 'border-destructive' : 'border-input'}
                    focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring
                  `}
                />
                {errors.apiSecret && (
                  <p className="text-destructive text-sm mt-1">{errors.apiSecret}</p>
                )}
              </div>

              {selectedBroker === 'binance' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="testnet"
                    checked={formData.redirectUri === 'testnet'}
                    onChange={e => handleChange('redirectUri', e.target.checked ? 'testnet' : '')}
                    className="rounded border-input"
                  />
                  <label htmlFor="testnet" className="text-sm font-medium">
                    Use Testnet (recommended for testing)
                  </label>
                </div>
              )}

              {selectedBroker === 'upstox' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="sandbox"
                    checked={formData.redirectUri === 'sandbox'}
                    onChange={e => handleChange('redirectUri', e.target.checked ? 'sandbox' : '')}
                    className="rounded border-input"
                  />
                  <label htmlFor="sandbox" className="text-sm font-medium">
                    Use Sandbox Environment (for testing)
                  </label>
                </div>
              )}

              {selectedBroker === 'upstox' && formData.redirectUri !== 'sandbox' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Redirect URI (Optional)</label>
                  <input
                    type="url"
                    value={formData.redirectUri}
                    onChange={e => handleChange('redirectUri', e.target.value)}
                    placeholder="https://your-domain.com/callback"
                    className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                  <p className="text-muted-foreground text-sm mt-1">
                    Leave empty to use default callback URL
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleModalClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="trading" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Adding Account...'
                  : `Add ${selectedBroker === 'kite' ? 'Kite' : selectedBroker === 'upstox' ? 'Upstox' : 'Binance'} Account`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
