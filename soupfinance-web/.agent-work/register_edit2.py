p='src/features/accounting/TransactionRegisterPage.tsx'
s=open(p).read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt,(old,s.count(old)); s=s.replace(old,new)
rep("""            <nav
              aria-label="Pagination\"""","""            <nav
              aria-label={t('transactions.paginationAria')}""")
rep("""                <p className="text-sm text-gray-700 dark:text-gray-400">
                  Showing{' '}
                  <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, filteredTransactions.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{filteredTransactions.length}</span>{' '}
                  results
                </p>""","""                <p className="text-sm text-gray-700 dark:text-gray-400">
                  {/* Changed (SOUPFIN-164): one translated sentence, numbers still in bold */}
                  <Trans
                    t={t}
                    i18nKey="transactions.paginationSummary"
                    values={{
                      from: (currentPage - 1) * pageSize + 1,
                      to: Math.min(currentPage * pageSize, filteredTransactions.length),
                      total: filteredTransactions.length,
                    }}
                    components={{ b: <span className="font-medium" /> }}
                  />
                </p>""")
rep("""                  data-testid="pagination-prev"
                >
                  Previous""","""                  data-testid="pagination-prev"
                >
                  {t('common:pagination.previous')}""")
rep("""                  data-testid="pagination-next"
                >
                  Next""","""                  data-testid="pagination-next"
                >
                  {t('common:pagination.next')}""")
rep("""text-text-light dark:text-text-dark">Advanced Filters</h2>""","""text-text-light dark:text-text-dark">{t('transactions.panel.title')}</h2>""")
rep("""                Date Range
              </label>""","""                {t('transactions.panel.dateRange')}
              </label>""")
rep("""                  id="panel-date-range-start\"""","""                  id="panel-date-range-start"
                  aria-label={t('transactions.filterBar.fromAria')}""")
rep("""                  id="panel-date-range-end\"""","""                  id="panel-date-range-end"
                  aria-label={t('transactions.filterBar.toAria')}""")
rep("""                htmlFor="panel-status-filter"
              >
                Status
              </label>""","""                htmlFor="panel-status-filter"
              >
                {t('transactions.panel.status')}
              </label>""")
rep("""                htmlFor="panel-type-filter"
              >
                Transaction Type
              </label>""","""                htmlFor="panel-type-filter"
              >
                {t('transactions.panel.type')}
              </label>""")
rep("""                htmlFor="panel-account-number"
              >
                Account Number
              </label>""","""                htmlFor="panel-account-number"
              >
                {t('transactions.panel.accountNumber')}
              </label>""")
rep("""                  htmlFor="panel-amount-min"
                >
                  Min Amount
                </label>""","""                  htmlFor="panel-amount-min"
                >
                  {t('transactions.filters.minAmount')}
                </label>""")
rep("""                  htmlFor="panel-amount-max"
                >
                  Max Amount
                </label>""","""                  htmlFor="panel-amount-max"
                >
                  {t('transactions.filters.maxAmount')}
                </label>""")
rep("""                <span className="truncate">Clear</span>""","""                <span className="truncate">{t('common:actions.clear')}</span>""")
rep("""                <span className="truncate">Apply</span>""","""                <span className="truncate">{t('common:actions.apply')}</span>""")
rep("""text-text-light dark:text-text-dark">Reporting</h2>""","""text-text-light dark:text-text-dark">{t('transactions.panel.reporting')}</h2>""")
rep("""                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  Generate Trial Balance
                </span>""","""                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  {t('transactions.panel.trialBalance')}
                </span>""")
rep("""<span className="text-sm font-medium text-gray-800 dark:text-gray-300">Journal Report</span>""","""<span className="text-sm font-medium text-gray-800 dark:text-gray-300">{t('transactions.panel.journalReport')}</span>""")
rep("""                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  Profit &amp; Loss Statement
                </span>""","""                <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  {t('transactions.panel.profitAndLoss')}
                </span>""")
rep("""        </div>
      </aside>
    </div>
  );
}""","""        </div>
      </aside>

      {/* Added (SOUPFIN-164): confirmation for Delete, batch Delete and Reverse */}
      <ConfirmDialog
        open={pendingConfirmation !== null}
        tone={pendingConfirmation?.kind === 'reverse' ? 'warning' : 'danger'}
        icon={pendingConfirmation?.kind === 'reverse' ? 'undo' : 'delete'}
        title={
          pendingConfirmation?.kind === 'reverse'
            ? t('transactions.confirm.reverseTitle', { id: pendingConfirmation.tx.transactionId })
            : pendingConfirmation?.kind === 'delete'
              ? t('transactions.confirm.deleteTitle', { id: pendingConfirmation.tx.transactionId })
              : t('transactions.confirm.batchDeleteTitle', { count: pendingConfirmation?.count ?? 0 })
        }
        message={
          pendingConfirmation?.kind === 'reverse'
            ? t('transactions.confirm.reverseMessage')
            : pendingConfirmation?.kind === 'delete'
              ? t('transactions.confirm.deleteMessage')
              : t('transactions.confirm.batchDeleteMessage', { count: pendingConfirmation?.count ?? 0 })
        }
        confirmLabel={
          pendingConfirmation?.kind === 'reverse' ? t('common:actions.reverse') : t('common:actions.delete')
        }
        isPending={isConfirming}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
        testId="transaction-confirm-dialog"
      />
    </div>
  );
}""")
open(p,'w').write(s)
print('ok')
