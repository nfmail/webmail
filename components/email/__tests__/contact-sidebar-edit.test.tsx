import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactSidebarPanel } from '../email-viewer';
import type { ContactCard } from '@/lib/jmap/types';

const contact: ContactCard = {
  id: 'c1',
  addressBookIds: {},
  name: {
    components: [
      { kind: 'given', value: 'Alice' },
      { kind: 'surname', value: 'Smith' },
    ],
    isOrdered: true,
  },
  emails: { e0: { address: 'alice@example.com' } },
};

const unknownEmail = 'unknown@example.com';

describe('ContactSidebarPanel', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows Edit button when contact is known and onEditContact is provided', () => {
    render(
      <ContactSidebarPanel
        email="alice@example.com"
        contact={contact}
        onClose={vi.fn()}
        onEditContact={vi.fn()}
      />,
    );
    // useTranslations mock echoes the English text passed to t()
    expect(screen.getByTitle('Edit contact')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('calls onEditContact when Edit button is clicked', () => {
    const onEditContact = vi.fn();
    render(
      <ContactSidebarPanel
        email="alice@example.com"
        contact={contact}
        onClose={vi.fn()}
        onEditContact={onEditContact}
      />,
    );
    fireEvent.click(screen.getByTitle('Edit contact'));
    expect(onEditContact).toHaveBeenCalledOnce();
  });

  it('does not show Edit button when contact is null', () => {
    render(
      <ContactSidebarPanel
        email={unknownEmail}
        contact={null}
        onClose={vi.fn()}
        onEditContact={vi.fn()}
      />,
    );
    expect(screen.queryByTitle('Edit contact')).not.toBeInTheDocument();
  });

  it('does not show Edit button when onEditContact is not provided', () => {
    render(
      <ContactSidebarPanel
        email="alice@example.com"
        contact={contact}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTitle('Edit contact')).not.toBeInTheDocument();
  });

  it('shows "not in contacts" message and Add button for unknown email', () => {
    const onAddToContacts = vi.fn();
    render(
      <ContactSidebarPanel
        email={unknownEmail}
        contact={null}
        onClose={vi.fn()}
        onAddToContacts={onAddToContacts}
      />,
    );
    expect(screen.getByText('Not in your contacts')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add to contacts'));
    expect(onAddToContacts).toHaveBeenCalledWith(unknownEmail, undefined);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ContactSidebarPanel
        email="alice@example.com"
        contact={contact}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close sidebar'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
