import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from './MembersPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

vi.mock('../api/membersPdfClient.js', () => ({
  downloadMembersPdf: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';
import { downloadMembersPdf } from '../api/membersPdfClient.js';

const MEMBERS = [
  {
    id: '1',
    firstname: 'Ada',
    lastname: 'Lovelace',
    gender: 'Female',
    mothersname: 'Anne',
    geezFirstname: 'ሰላም',
    geezLastname: 'ተስፋዬ',
    geezMothersname: 'አበባ'
  },
  {
    id: '2',
    firstname: 'Bo',
    lastname: 'Zed',
    gender: 'Male',
    mothersname: null,
    geezFirstname: null,
    geezLastname: null,
    geezMothersname: null
  },
  {
    id: '3',
    firstname: 'Cy',
    lastname: 'Yoo',
    gender: 'Other',
    mothersname: null,
    geezFirstname: null,
    geezLastname: null,
    geezMothersname: null
  }
];

function renderPage() {
  return render(
    <MemoryRouter>
      <MembersPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  graphqlRequest.mockResolvedValue({ familyMembersDepthFirst: MEMBERS });
});

describe('MembersPage', () => {
  it('shows a loading state, then every member with Latin and Ge\'ez names', async () => {
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ሰላም ተስፋዬ')).toBeInTheDocument();
    expect(screen.getByText('Anne')).toBeInTheDocument();
    expect(screen.getByText('አበባ')).toBeInTheDocument();
    expect(screen.getByText('Bo Zed')).toBeInTheDocument();
    expect(screen.getByText('Cy Yoo')).toBeInTheDocument();
    expect(graphqlRequest.mock.calls[0][0]).toContain('familyMembersDepthFirst');
  });

  it('renders rows in the server order without re-sorting', async () => {
    graphqlRequest.mockResolvedValue({ familyMembersDepthFirst: [MEMBERS[2], MEMBERS[0], MEMBERS[1]] });
    renderPage();
    await screen.findByText('Ada Lovelace');
    const names = screen
      .getAllByRole('row')
      .map((r) => r.textContent)
      .filter((t) => /Cy Yoo|Ada Lovelace|Bo Zed/.test(t))
      .map((t) => t.match(/Cy Yoo|Ada Lovelace|Bo Zed/)[0]);
    expect(names).toEqual(['Cy Yoo', 'Ada Lovelace', 'Bo Zed']);
  });

  it('renders null values as an en dash', async () => {
    renderPage();
    const row = (await screen.findByText('Bo Zed')).closest('tr');
    expect(within(row).getAllByText('–').length).toBeGreaterThanOrEqual(3);
  });

  it('labels gender with text, not color alone', async () => {
    renderPage();
    const adaRow = (await screen.findByText('Ada Lovelace')).closest('tr');
    expect(within(adaRow).getByText('Female')).toBeInTheDocument();
    const boRow = screen.getByText('Bo Zed').closest('tr');
    expect(within(boRow).getByText('Male')).toBeInTheDocument();
    const cyRow = screen.getByText('Cy Yoo').closest('tr');
    expect(within(cyRow).getByText('Other')).toBeInTheDocument();
  });

  it("marks Ge'ez text with lang=am", async () => {
    renderPage();
    const geez = await screen.findByText('ሰላም ተስፋዬ');
    expect(geez).toHaveAttribute('lang', 'am');
  });

  it('shows an Alert with Retry when loading fails', async () => {
    graphqlRequest.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('calls downloadMembersPdf when Download PDF is clicked', async () => {
    downloadMembersPdf.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Ada Lovelace');
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(downloadMembersPdf).toHaveBeenCalledTimes(1));
  });

  it('shows an Alert when the PDF download fails', async () => {
    downloadMembersPdf.mockRejectedValue(new Error('Request failed with status code 403'));
    renderPage();
    await screen.findByText('Ada Lovelace');
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(await screen.findByText('Request failed with status code 403')).toBeInTheDocument();
  });
});
