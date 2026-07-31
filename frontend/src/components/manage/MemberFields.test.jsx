import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import MemberFields from './MemberFields.jsx';

const EMPTY_FORM = {
  firstname: '',
  lastname: '',
  geezFirstname: '',
  geezLastname: '',
  gender: '',
  mothersname: '',
  geezMothersname: '',
  email: '',
  birthdate: '',
  isAlive: true,
  phone: '',
  address: ''
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderFields(props = {}) {
  const onChange = vi.fn();
  const utils = render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MemberFields form={EMPTY_FORM} onChange={onChange} {...props} />
    </LocalizationProvider>
  );
  return { ...utils, onChange };
}

describe('MemberFields', () => {
  it('renders every member field once', () => {
    renderFields();

    expect(screen.getByLabelText(/^First name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Ge'ez first name (ስም)", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Ge'ez last name (ስም ኣቦ)", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Gender', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mother's name/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Ge'ez mother's name (ስም ኣደ)", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Birthdate', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Living')).toBeInTheDocument();
    expect(screen.getByLabelText('Email', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Phone', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Address', { exact: false })).toBeInTheDocument();
  });

  it("renders the 3 Ge'ez fields and calls onChange with their respective keys", async () => {
    const { onChange } = renderFields();

    await userEvent.type(screen.getByLabelText("Ge'ez first name (ስም)", { exact: false }), 'ጃ');
    expect(onChange).toHaveBeenCalledWith('geezFirstname', 'ጃ');

    await userEvent.type(screen.getByLabelText("Ge'ez last name (ስም ኣቦ)", { exact: false }), 'ነ');
    expect(onChange).toHaveBeenCalledWith('geezLastname', 'ነ');

    await userEvent.type(screen.getByLabelText("Ge'ez mother's name (ስም ኣደ)", { exact: false }), 'ማ');
    expect(onChange).toHaveBeenCalledWith('geezMothersname', 'ማ');
  });

  it("does not mark any of the 3 Ge'ez fields as required (D-03)", () => {
    renderFields();

    expect(screen.getByLabelText("Ge'ez first name (ስም)", { exact: false })).not.toBeRequired();
    expect(screen.getByLabelText("Ge'ez last name (ስም ኣቦ)", { exact: false })).not.toBeRequired();
    expect(screen.getByLabelText("Ge'ez mother's name (ስም ኣደ)", { exact: false })).not.toBeRequired();
  });

  it('calls onChange(field, value) for a text field', async () => {
    const { onChange } = renderFields();

    await userEvent.type(screen.getByLabelText(/^First name/i), 'A');

    expect(onChange).toHaveBeenCalledWith('firstname', 'A');
  });

  it('round-trips a stored YYYY-MM-DD birthdate string into the calendar field', () => {
    renderFields({ form: { ...EMPTY_FORM, birthdate: '1990-05-15' } });

    // dayjs default localized display is MM/DD/YYYY — proves the DATEONLY string
    // is parsed via dayjs and shown in the DatePicker (string -> dayjs -> field).
    expect(screen.getByLabelText('Birthdate', { exact: false })).toHaveValue('05/15/1990');
  });

  it('reflects isAlive on the Living switch and toggles it via onChange', async () => {
    const { onChange } = renderFields({ form: { ...EMPTY_FORM, isAlive: true } });

    const living = screen.getByLabelText('Living');
    expect(living).toBeChecked();

    await userEvent.click(living);
    expect(onChange).toHaveBeenCalledWith('isAlive', false);
  });

  it('labels the switch "Deceased" when isAlive is false', () => {
    renderFields({ form: { ...EMPTY_FORM, isAlive: false } });
    expect(screen.getByLabelText('Deceased')).not.toBeChecked();
  });

  it('does not render the photo control unless withPhoto is set', () => {
    renderFields();
    expect(screen.queryByRole('button', { name: 'Add photo' })).not.toBeInTheDocument();
  });

  it('renders an "Add photo" control and routes a picked file to onPickPhoto when withPhoto', async () => {
    const onPickPhoto = vi.fn();
    renderFields({ withPhoto: true, onPickPhoto });

    expect(screen.getByRole('button', { name: 'Add photo' })).toBeInTheDocument();

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, file);

    expect(onPickPhoto).toHaveBeenCalledTimes(1);
    expect(onPickPhoto.mock.calls[0][0]).toBeInstanceOf(File);
  });

  it('shows "Change photo" + "Remove" when a photo is already picked', async () => {
    const onClearPhoto = vi.fn();
    renderFields({ withPhoto: true, photoPreviewUrl: 'blob:preview', onClearPhoto });

    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClearPhoto).toHaveBeenCalled();
  });
});
