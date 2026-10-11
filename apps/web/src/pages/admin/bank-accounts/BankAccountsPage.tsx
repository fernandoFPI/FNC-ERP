import { Trans, useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  BANK_ACCOUNTS_QUERY,
  CREATE_BANK_ACCOUNT,
  UPDATE_BANK_ACCOUNT,
  DELETE_BANK_ACCOUNT,
} from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { useToastStore } from '../../../store/toastStore'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { BankAccountsQuery, BankAccountsQueryVariables, CreateBankAccountMutation, CreateBankAccountMutationVariables, DeleteBankAccountMutation, DeleteBankAccountMutationVariables, UpdateBankAccountMutation, UpdateBankAccountMutationVariables } from '../../../graphql/generated'

interface BankAccount {
  id: string
  accountName: string
  bankName: string
  beneficiaryName?: string | null
  accountNumber?: string | null
  iban?: string | null
  swift?: string | null
  branchCode?: string | null
  bankAddress?: string | null
  intermediaryBankName?: string | null
  intermediarySwift?: string | null
  intermediaryCountry?: string | null
  currencyCode: string
  isActive: boolean
  createdAt: string
}

const EMPTY_FORM = {
  accountName: '',
  bankName: '',
  beneficiaryName: '',
  accountNumber: '',
  iban: '',
  swift: '',
  branchCode: '',
  bankAddress: '',
  intermediaryBankName: '',
  intermediarySwift: '',
  intermediaryCountry: '',
  currencyCode: 'IQD',
  isActive: true,
}

export default function BankAccountsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [modal, setModal] = useState<{ open: boolean; editing: BankAccount | null }>({
    open: false,
    editing: null,
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<BankAccount | null>(null)

  const { data, loading, refetch } = useQuery<BankAccountsQuery, BankAccountsQueryVariables>(BANK_ACCOUNTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  const [createAccount, { loading: creating }] = useMutation<CreateBankAccountMutation, CreateBankAccountMutationVariables>(CREATE_BANK_ACCOUNT)
  const [updateAccount, { loading: updating }] = useMutation<UpdateBankAccountMutation, UpdateBankAccountMutationVariables>(UPDATE_BANK_ACCOUNT)
  const [deleteAccount, { loading: deleting }] = useMutation<DeleteBankAccountMutation, DeleteBankAccountMutationVariables>(DELETE_BANK_ACCOUNT)

  const accounts: BankAccount[] = data?.bankAccounts ?? []

  function openCreate() {
    setForm(EMPTY_FORM)
    setModal({ open: true, editing: null })
  }

  function openEdit(a: BankAccount) {
    setForm({
      accountName: a.accountName,
      bankName: a.bankName,
      beneficiaryName: a.beneficiaryName ?? '',
      accountNumber: a.accountNumber ?? '',
      iban: a.iban ?? '',
      swift: a.swift ?? '',
      branchCode: a.branchCode ?? '',
      bankAddress: a.bankAddress ?? '',
      intermediaryBankName: a.intermediaryBankName ?? '',
      intermediarySwift: a.intermediarySwift ?? '',
      intermediaryCountry: a.intermediaryCountry ?? '',
      currencyCode: a.currencyCode,
      isActive: a.isActive,
    })
    setModal({ open: true, editing: a })
  }

  async function save() {
    try {
      const input = {
        accountName: form.accountName,
        bankName: form.bankName,
        beneficiaryName: form.beneficiaryName || null,
        accountNumber: form.accountNumber || null,
        iban: form.iban || null,
        swift: form.swift || null,
        currencyCode: form.currencyCode,
        branchCode: form.branchCode || null,
        bankAddress: form.bankAddress || null,
        intermediaryBankName: form.intermediaryBankName || null,
        intermediarySwift: form.intermediarySwift || null,
        intermediaryCountry: form.intermediaryCountry || null,
        isActive: form.isActive,
      }
      if (modal.editing) {
        await updateAccount({ variables: { id: modal.editing.id, input } })
        addToast({ type: 'success', message: t('admin.bank.bankAccountUpdated') })
      } else {
        await createAccount({ variables: { input } })
        addToast({ type: 'success', message: t('admin.bank.bankAccountCreated') })
      }
      setModal({ open: false, editing: null })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function confirmDeleteAccount() {
    if (!confirmDelete) return
    try {
      await deleteAccount({ variables: { id: confirmDelete.id } })
      addToast({ type: 'success', message: t('admin.bank.bankAccountDeleted') })
      setConfirmDelete(null)
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  const iStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
    fontSize: '13px',
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={t('admin.bank.bankAccounts')}
        subtitle={t('admin.bank.universalBankAccountsAvailableForSelection')}
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            {t('admin.bank.addBankAccount')}
          </Button>
        }
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '10px' }} />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {t('admin.bank.noBankAccountsYetAddOne')}
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {accounts.map((a) => (
            <Card key={a.id} style={{ padding: '16px 20px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                      {a.accountName}
                    </span>
                    <Badge variant="neutral">{a.currencyCode}</Badge>
                    <Badge variant={a.isActive ? 'success' : 'neutral'}>
                      {a.isActive ? t('admin.bank.active') : t('admin.bank.inactive')}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>
                      <span style={{ color: theme.textSecondary, fontWeight: 500 }}>{t('admin.bank.bank')} </span>
                      {a.bankName}
                    </span>
                    {a.accountNumber && (
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>
                        <span style={{ color: theme.textSecondary, fontWeight: 500 }}>
                          {t('admin.bank.account')}{' '}
                        </span>
                        {a.accountNumber}
                      </span>
                    )}
                    {a.iban && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: theme.textMuted,
                          fontFamily: 'monospace',
                        }}
                      >
                        <span
                          style={{
                            color: theme.textSecondary,
                            fontWeight: 500,
                            fontFamily: 'inherit',
                          }}
                        >
                          {t('admin.bank.iban')}{' '}
                        </span>
                        {a.iban}
                      </span>
                    )}
                    {a.swift && (
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>
                        <span style={{ color: theme.textSecondary, fontWeight: 500 }}>{t('admin.bank.swift')} </span>
                        {a.swift}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginInlineStart: '16px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      openEdit(a)
                    }}
                  >
                    {t('admin.bank.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmDelete(a)
                    }}
                  >
                    {t('admin.bank.delete')}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modal.open && (
        <Modal
          open={modal.open}
          title={modal.editing ? t('admin.bank.editBankAccount') : t('admin.bank.addBankAccount')}
          onClose={() => {
            setModal({ open: false, editing: null })
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              minWidth: '500px',
              maxWidth: '580px',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.accountName')}
                </label>
                <input
                  value={form.accountName}
                  onChange={(e) => {
                    setForm({ ...form, accountName: e.target.value })
                  }}
                  placeholder={t('admin.bank.eGFncUsd')}
                  style={iStyle}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.beneficiaryName')}
                </label>
                <input
                  value={form.beneficiaryName}
                  onChange={(e) => {
                    setForm({ ...form, beneficiaryName: e.target.value })
                  }}
                  placeholder={t('admin.bank.eGFirstNationalCompanyP')}
                  style={iStyle}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.bankName')}
                </label>
                <input
                  value={form.bankName}
                  onChange={(e) => {
                    setForm({ ...form, bankName: e.target.value })
                  }}
                  placeholder={t('admin.bank.eGTbiBank')}
                  style={iStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.accountNumber')}
                </label>
                <input
                  value={form.accountNumber}
                  onChange={(e) => {
                    setForm({ ...form, accountNumber: e.target.value })
                  }}
                  placeholder={t('admin.bank.0003002130002Usd')}
                  style={iStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.branchCode')}
                </label>
                <input
                  value={form.branchCode}
                  onChange={(e) => {
                    setForm({ ...form, branchCode: e.target.value })
                  }}
                  placeholder="0003"
                  style={iStyle}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.iban2')}
                </label>
                <input
                  value={form.iban}
                  onChange={(e) => {
                    setForm({ ...form, iban: e.target.value })
                  }}
                  placeholder={t('admin.bank.iq21triq')}
                  style={{ ...iStyle, fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.swiftBic')}
                </label>
                <input
                  value={form.swift}
                  onChange={(e) => {
                    setForm({ ...form, swift: e.target.value })
                  }}
                  placeholder={t('admin.bank.triqiqbaxxx')}
                  style={iStyle}
                />
              </div>
              <div>
                <SearchableSelect
                  label={t('admin.bank.currency')}
                  value={form.currencyCode}
                  onChange={(v) => {
                    setForm({ ...form, currencyCode: v })
                  }}
                  options={[
                    { value: 'IQD', label: 'IQD' },
                    { value: 'USD', label: 'USD' },
                    { value: 'EUR', label: 'EUR' },
                    { value: 'GBP', label: 'GBP' },
                    { value: 'AED', label: 'AED' },
                  ]}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.bankAddress')}
                </label>
                <textarea
                  value={form.bankAddress}
                  onChange={(e) => {
                    setForm({ ...form, bankAddress: e.target.value })
                  }}
                  placeholder={t('admin.bank.zagrosRoadErbilIraq')}
                  rows={2}
                  style={{ ...iStyle, resize: 'vertical' }}
                />
              </div>
              <div
                style={{
                  gridColumn: '1 / -1',
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '10px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: '10px',
                  }}
                >
                  {t('admin.bank.intermediaryBankOptional')}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.intermediaryBankName')}
                </label>
                <input
                  value={form.intermediaryBankName}
                  onChange={(e) => {
                    setForm({ ...form, intermediaryBankName: e.target.value })
                  }}
                  placeholder={t('admin.bank.eGJpMorganChaseBank')}
                  style={iStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.intermediarySwift')}
                </label>
                <input
                  value={form.intermediarySwift}
                  onChange={(e) => {
                    setForm({ ...form, intermediarySwift: e.target.value })
                  }}
                  placeholder={t('admin.bank.chasus33xxx')}
                  style={iStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.bank.intermediaryCountry')}
                </label>
                <input
                  value={form.intermediaryCountry}
                  onChange={(e) => {
                    setForm({ ...form, intermediaryCountry: e.target.value })
                  }}
                  placeholder={t('admin.bank.usa')}
                  style={iStyle}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: theme.textPrimary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => {
                      setForm({ ...form, isActive: e.target.checked })
                    }}
                  />
                  {t('admin.bank.active')}
                </label>
              </div>
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setModal({ open: false, editing: null })
                }}
              >
                {t('admin.bank.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={creating || updating}
                disabled={!form.accountName || !form.bankName}
                onClick={() => void save()}
              >
                {modal.editing ? t('admin.bank.saveChanges') : t('admin.bank.addAccount')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal
          open={!!confirmDelete}
          title={t('admin.bank.deleteBankAccount')}
          onClose={() => {
            setConfirmDelete(null)
          }}
        >
          <div style={{ minWidth: '340px' }}>
            <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '20px' }}>
              <Trans
                i18nKey="admin.bank.deleteConfirm"
                values={{ name: confirmDelete.accountName }}
                components={{ strong: <strong /> }}
              />
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmDelete(null)
                }}
              >
                {t('admin.bank.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={deleting}
                onClick={() => void confirmDeleteAccount()}
              >
                {t('admin.bank.delete')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
