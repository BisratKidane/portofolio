import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoCropDialog from './PhotoCropDialog.jsx';

vi.mock('../../api/photoClient.js', () => ({
  uploadMemberPhoto: vi.fn()
}));

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }) => {
    if (onCropComplete) {
      onCropComplete({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
    }
    return <div data-testid="mock-cropper" />;
  }
}));

import { uploadMemberPhoto } from '../../api/photoClient.js';

const MEMBER = { id: '2', fullname: 'Grace Hopper' };

function makeFile() {
  return new File(['fake-bytes'], 'photo.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toBlob = vi.fn(function toBlob(callback) {
    callback(new Blob(['fake-cropped'], { type: 'image/jpeg' }));
  });
  global.Image = class {
    set src(value) {
      this._src = value;
      if (this.onload) this.onload();
    }
    get src() {
      return this._src;
    }
  };
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onUploaded = vi.fn();
  const utils = render(
    <PhotoCropDialog open file={makeFile()} member={MEMBER} onClose={onClose} onUploaded={onUploaded} {...props} />
  );
  return { ...utils, onClose, onUploaded };
}

describe('PhotoCropDialog', () => {
  it('renders "Save photo" and "Cancel" buttons', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Save photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders a Slider with aria-label="Zoom"', () => {
    renderDialog();

    expect(screen.getByRole('slider', { name: 'Zoom' })).toBeInTheDocument();
  });

  it('shows "Uploading…" and disables both buttons while submitting', async () => {
    uploadMemberPhoto.mockReturnValueOnce(new Promise(() => {}));
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    expect(await screen.findByRole('button', { name: 'Uploading…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('does not invoke onClose while submitting (dialog non-dismissible)', async () => {
    uploadMemberPhoto.mockReturnValueOnce(new Promise(() => {}));
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
    await screen.findByRole('button', { name: 'Uploading…' });

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders an error Alert and re-enables both buttons when uploadMemberPhoto rejects', async () => {
    uploadMemberPhoto.mockRejectedValueOnce(new Error('Upload failed.'));
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed.');
    expect(screen.getByRole('button', { name: 'Save photo' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
  });

  it('clicking Cancel discards the selection and never calls uploadMemberPhoto', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(uploadMemberPhoto).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('on successful submit, crops via a 512x512 canvas, calls uploadMemberPhoto with the member id and blob, then closes', async () => {
    uploadMemberPhoto.mockResolvedValueOnce({ photoUrl: '/api/family-members/2/photo' });
    const { onClose, onUploaded } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => {
      expect(uploadMemberPhoto).toHaveBeenCalledTimes(1);
    });

    const [memberId, blob] = uploadMemberPhoto.mock.calls[0];
    expect(memberId).toBe('2');
    expect(blob).toBeInstanceOf(Blob);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
