p='src/features/clients/ClientListPage.tsx'; s=open(p).read()
R=[
("""import { useState } from 'react';
""","""import { useState } from 'react';
// Added (SOUPFIN-167): every visible string comes from the clients namespace
import { Trans, useTranslation } from 'react-i18next';
"""),
("""export function ClientListPage() {
  const queryClient = useQueryClient();
""","""export function ClientListPage() {
  const { t } = useTranslation('clients');
  const queryClient = useQueryClient();
"""),
("""  const getDisplayName = getClientDisplayName;""","""  const getDisplayName = (client: Client) => getClientDisplayName(client, t('unnamed'));"""),
("""            Clients
          </h1>
          <p className="text-subtle-text">Manage your customers and billing contacts</p>""","""            {t('title')}
          </h1>
          <p className="text-subtle-text">{t('subtitle')}</p>"""),
("""          New Client
        </Link>""","""          {t('newClient')}
        </Link>"""),
("""aria-label="Filter clients by type\"""","""aria-label={t('list.typeFilterLabel')}"""),
("""          <option value="">All Types</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="CORPORATE">Corporate</option>""","""          <option value="">{t('types.all')}</option>
          <option value="INDIVIDUAL">{t('types.individual')}</option>
          <option value="CORPORATE">{t('types.corporate')}</option>"""),
("""            Filtering…""","""            {t('list.filtering')}"""),
("""            <span className="material-symbols-outlined text-lg">filter_alt_off</span>
            Clear filters
          </button>
        )}""","""            <span className="material-symbols-outlined text-lg">filter_alt_off</span>
            {t('actions.clearFilters')}
          </button>
        )}"""),
("""            Loading clients...""","""            {t('list.loading')}"""),
("""">Failed to load clients</h3>
            <p className="text-subtle-text mb-4">There was an error loading your clients. Please try again.</p>""","""">{t('list.errorTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('list.errorBody')}</p>"""),
("""              Retry
            </button>""","""              {t('actions.retry')}
            </button>"""),
("""                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Type</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Phone</th>
                  <th className="px-6 py-3 text-center">Actions</th>""","""                  <th className="px-6 py-3 text-left">{t('fields.name')}</th>
                  <th className="px-6 py-3 text-left">{t('fields.type')}</th>
                  <th className="px-6 py-3 text-left">{t('fields.email')}</th>
                  <th className="px-6 py-3 text-left">{t('fields.phone')}</th>
                  <th className="px-6 py-3 text-center">{t('list.actionsColumn')}</th>"""),
("""                            <span className="material-symbols-outlined text-sm mr-1">person</span>
                            Individual""","""                            <span className="material-symbols-outlined text-sm mr-1">person</span>
                            {t('types.individual')}"""),
("""                            <span className="material-symbols-outlined text-sm mr-1">business</span>
                            Corporate""","""                            <span className="material-symbols-outlined text-sm mr-1">business</span>
                            {t('types.corporate')}"""),
("""                          title="View\"""","""                          title={t('actions.view')}
                          aria-label={t('actions.view')}"""),
("""                          title="Edit\"""","""                          title={t('actions.edit')}
                          aria-label={t('actions.edit')}"""),
("""                          title="Delete\"""","""                          title={t('actions.delete')}
                          aria-label={t('actions.delete')}"""),
("""              No clients match your filters
            </h3>""","""              {t('list.noResultsTitle')}
            </h3>"""),
("""              {searchTerm && typeFilter
                ? `No ${typeFilter === 'INDIVIDUAL' ? 'individual' : 'corporate'} clients match "${searchTerm}". Try broadening your search or removing filters.`
                : searchTerm
                  ? `No clients match "${searchTerm}". Try a different search term.`
                  : `No ${typeFilter === 'INDIVIDUAL' ? 'individual' : 'corporate'} clients found. Try a different type or clear the filter.`}""","""              {/* Changed (SOUPFIN-167): one whole sentence per case, so each
                  language can inflect "individual"/"corporate" its own way */}
              {searchTerm && typeFilter
                ? typeFilter === 'INDIVIDUAL'
                  ? t('list.noResultsSearchIndividual', { search: searchTerm })
                  : t('list.noResultsSearchCorporate', { search: searchTerm })
                : searchTerm
                  ? t('list.noResultsSearch', { search: searchTerm })
                  : typeFilter === 'INDIVIDUAL'
                    ? t('list.noResultsIndividual')
                    : t('list.noResultsCorporate')}"""),
("""              <span className="material-symbols-outlined text-lg">filter_alt_off</span>
              Clear filters
            </button>
          </div>""","""              <span className="material-symbols-outlined text-lg">filter_alt_off</span>
              {t('actions.clearFilters')}
            </button>
          </div>"""),
(""">No clients yet</h3>
            <p className="text-subtle-text mb-4">Add your first client to start creating invoices.</p>""",""">{t('list.emptyTitle')}</h3>
            <p className="text-subtle-text mb-4">{t('list.emptyBody')}</p>"""),
("""              Add Client
            </Link>""","""              {t('actions.addClient')}
            </Link>"""),
(""">Delete Client</p>""",""">{t('deleteDialog.title')}</p>"""),
("""                data-testid="client-delete-modal-close"
              >""","""                data-testid="client-delete-modal-close"
                aria-label={t('actions.close')}
              >"""),
("""                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{deleteState.clientName}</span>?""","""                    <Trans
                      t={t}
                      i18nKey="deleteDialog.confirm"
                      values={{ name: deleteState.clientName }}
                      components={{ bold: <span className="font-semibold" /> }}
                    />"""),
("""                    This action cannot be undone. Invoices associated with this client will remain
                    but the client reference will be removed.""","""                    {t('deleteDialog.body')}"""),
("""                      Could not delete this client. Please try again.""","""                      {t('deleteDialog.error')}"""),
("""                data-testid="delete-cancel-button"
              >
                Cancel""","""                data-testid="delete-cancel-button"
              >
                {t('actions.cancel')}"""),
("""{deleteMutation.isPending ? 'Deleting...' : 'Delete'}""","""{deleteMutation.isPending ? t('actions.deleting') : t('actions.delete')}"""),
]
for a,b in R:
  assert s.count(a)==1, (s.count(a), a[:80])
  s=s.replace(a,b)
open(p,'w').write(s)
