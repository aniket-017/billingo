import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,

  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, type Product, type StockMovement } from '@/src/api/client';
import AddProductSheet from '@/src/components/AddProductSheet';
import BulkImportSheet from '@/src/components/BulkImportSheet';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import Toast from '@/src/components/Toast';
import { colors, font, radius, spacing } from '@/src/theme';
import { formatCurrency } from '@/src/utils/format';

const AMBER = '#f59e0b';
const AMBER_BG = '#fffbeb';
const GREEN_BG = '#f0fdf4';
const RED_BG = '#fef2f2';

function getStockStatus(p: Product) {
  const qty = p.quantityOnHand ?? 0;
  const reorder = p.reorderLevel ?? 0;
  if (qty === 0) return { label: 'Out of stock', color: colors.danger, bg: RED_BG } as const;
  if (reorder > 0 && qty <= reorder)
    return { label: 'Low stock', color: AMBER, bg: AMBER_BG } as const;
  return { label: 'In stock', color: colors.success, bg: GREEN_BG } as const;
}

function isExpiringSoon(expiryDate?: string | null): boolean {
  if (!expiryDate) return false;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
}

function isExpired(expiryDate?: string | null): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() < Date.now();
}

function effectivePrice(p: Product): number {
  return p.sellingPrice ?? p.mrp ?? p.price ?? 0;
}

function formatExpiry(val?: string | null): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseExpiryToIso(val: string): string | null {
  if (!val) return null;
  const parts = val.trim().split('/');
  if (parts.length === 2) {
    const mm = parts[0].padStart(2, '0');
    const yyyy = parts[1].length === 2 ? '20' + parts[1] : parts[1];
    return `${yyyy}-${mm}-01`;
  }
  return val;
}

const MOVEMENT_META: Record<string, { label: string; icon: string; color: string }> = {
  OPENING: { label: 'Opening', icon: 'flag-outline', color: colors.primary[600] },
  STOCK_IN: { label: 'Stock In', icon: 'arrow-down-circle-outline', color: colors.success },
  SALE: { label: 'Sale', icon: 'cart-outline', color: colors.danger },
  ADJUSTMENT: { label: 'Adjustment', icon: 'build-outline', color: AMBER },
  RETURN_IN: { label: 'Return', icon: 'arrow-undo-outline', color: colors.primary[600] },
};

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Add-stock form
  const [stockFormOpen, setStockFormOpen] = useState(false);
  const [sfBoxes, setSfBoxes] = useState('1');
  const [sfStrips, setSfStrips] = useState('1');
  const [sfTabs, setSfTabs] = useState('1');
  const [sfBatch, setSfBatch] = useState('');
  const [sfExpiry, setSfExpiry] = useState('');
  const [sfDealer, setSfDealer] = useState('');
  const [sfCost, setSfCost] = useState('');
  const [sfMrp, setSfMrp] = useState('');
  const [sfSell, setSfSell] = useState('');
  const [sfNotes, setSfNotes] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  // Movement history
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsTotalPages, setMovementsTotalPages] = useState(1);
  const [movementsLoadingMore, setMovementsLoadingMore] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'in' | 'out'>('all');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [supplierFilter, setSupplierFilter] = useState('All suppliers');
  const [nearExpiryOnly, setNearExpiryOnly] = useState(false);
  const [recentFirst, setRecentFirst] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const productsRequestId = useRef(0);

  // Movement detail / edit
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const [selectedMovementInvoice, setSelectedMovementInvoice] = useState<
    NonNullable<StockMovement['stockInInvoice']> | null
  >(null);
  const [editingMovement, setEditingMovement] = useState(false);
  const [emBoxes, setEmBoxes] = useState('');
  const [emStrips, setEmStrips] = useState('');
  const [emTabs, setEmTabs] = useState('');
  const [emBatch, setEmBatch] = useState('');
  const [emExpiry, setEmExpiry] = useState('');
  const [emDealer, setEmDealer] = useState('');
  const [emCost, setEmCost] = useState('');
  const [emMrp, setEmMrp] = useState('');
  const [emSell, setEmSell] = useState('');
  const [emNotes, setEmNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const sfTotalUnits = useMemo(() => {
    return Math.max(1, parseInt(sfBoxes) || 1) * Math.max(1, parseInt(sfStrips) || 1) * Math.max(1, parseInt(sfTabs) || 1);
  }, [sfBoxes, sfStrips, sfTabs]);

  const emTotalUnits = useMemo(() => {
    return Math.max(1, parseInt(emBoxes) || 1) * Math.max(1, parseInt(emStrips) || 1) * Math.max(1, parseInt(emTabs) || 1);
  }, [emBoxes, emStrips, emTabs]);

  const filteredMovements = useMemo(() => {
    if (historyFilter === 'all') return movements;
    if (historyFilter === 'in') return movements.filter((m) => m.type === 'STOCK_IN' || m.type === 'OPENING' || m.type === 'RETURN_IN');
    return movements.filter((m) => m.type === 'SALE' || m.type === 'ADJUSTMENT');
  }, [movements, historyFilter]);

  const latestStockIn = useMemo(() => {
    const stockIns = movements.filter((m) => m.type === 'STOCK_IN' || m.type === 'OPENING');
    if (stockIns.length === 0) return null;
    return stockIns.reduce((latest, m) => new Date(m.date) > new Date(latest.date) ? m : latest, stockIns[0]);
  }, [movements]);

  const categorySuggestions = useMemo(
    () =>
      [...new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b)
      ),
    [products]
  );
  useEffect(() => {
    api.products
      .list()
      .then((items) => {
        const categories = [...new Set(items.map((p) => p.category?.trim()).filter(Boolean) as string[])].sort((a, b) =>
          a.localeCompare(b)
        );
        setAllCategories(categories);
      })
      .catch(() => setAllCategories([]));
  }, []);
  const supplierSuggestions = useMemo(
    () =>
      [...new Set(products.map((p) => p.dealerName?.trim()).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b)
      ),
    [products]
  );
  const categoryOptions = useMemo(() => ['All', ...(allCategories.length > 0 ? allCategories : categorySuggestions)], [allCategories, categorySuggestions]);

  const displayedProducts = useMemo(() => {
    let next = [...products];

    if (stockFilter !== 'all') {
      next = next.filter((product) => {
        const qty = product.quantityOnHand ?? 0;
        const reorder = product.reorderLevel ?? 0;
        if (stockFilter === 'out') return qty <= 0;
        if (stockFilter === 'low') return qty > 0 && reorder > 0 && qty <= reorder;
        return qty > 0;
      });
    }
    if (nearExpiryOnly) {
      next = next.filter((product) => isExpiringSoon(product.expiryDate));
    }
    if (supplierFilter !== 'All suppliers') {
      next = next.filter((product) => (product.dealerName?.trim() || '') === supplierFilter);
    }
    if (!recentFirst) {
      next.sort((a, b) => a.name.localeCompare(b.name));
    }
    return next;
  }, [products, stockFilter, nearExpiryOnly, supplierFilter, recentFirst]);

  const load = useCallback(async (q?: string, page = 1, append = false) => {
    const requestId = ++productsRequestId.current;
    const category = selectedCategory === 'All' ? undefined : selectedCategory;
    if (page === 1) setLoading(true);
    else setLoadingMoreProducts(true);
    try {
      const data = await api.products.listPaged(q || undefined, page, 20, category);

      if (requestId === productsRequestId.current) {
        setProducts((prev) => (append ? [...prev, ...data.items] : data.items));
        setProductsPage(data.page);
        setProductsTotalPages(data.totalPages);
      }
    } catch {
      if (requestId === productsRequestId.current) {
        setProducts([]);
        setProductsPage(1);
        setProductsTotalPages(1);
      }
    } finally {
      if (requestId === productsRequestId.current) {
        setLoading(false);
        setLoadingMoreProducts(false);
      }
    }
  }, [selectedCategory]);

  useEffect(() => {
    const t = setTimeout(() => load(query, 1), 300);
    return () => clearTimeout(t);
  }, [query, selectedCategory, load]);

  function prefillStockForm(p: Product) {
    setSfBoxes(String(p.numBoxes ?? 1));
    setSfStrips(String(p.stripsPerBox ?? 1));
    setSfTabs(String(p.tabletsPerStrip ?? 1));
    setSfBatch(p.batchNo ?? '');
    setSfExpiry(formatExpiry(p.expiryDate));
    setSfDealer(p.dealerName ?? '');
    setSfCost(p.costPrice ? String(p.costPrice) : '');
    setSfMrp(p.mrp ? String(p.mrp) : '');
    setSfSell(p.sellingPrice ? String(p.sellingPrice) : '');
    setSfNotes('');
  }

  async function loadMovements(productId: string, page = 1, append = false) {
    if (page === 1) setMovementsLoading(true);
    else setMovementsLoadingMore(true);
    try {
      const res = await api.inventory.movementsByProduct(productId, page, 20);
      setMovements((prev) => append ? [...prev, ...res.items] : res.items);
      setMovementsPage(res.page);
      setMovementsTotalPages(res.totalPages);
      setHistoryError('');
    } catch (e) {
      if (!append) {
        setMovements([]);
        setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
      }
    } finally {
      setMovementsLoading(false);
      setMovementsLoadingMore(false);
    }
  }

  async function openDetail(p: Product) {
    setSelected(p);
    setStockFormOpen(false);
    setSelectedMovement(null);
    setEditingMovement(false);
    setHistoryFilter('all');
    prefillStockForm(p);
    setMovements([]);
    setHistoryError('');
    loadMovements(p.id);
  }

  function closeDetail() {
    setSelected(null);
    setStockFormOpen(false);
    setSelectedMovement(null);
    setEditingMovement(false);
    setMovements([]);
  }

  function prefillMovementEditForm(m: StockMovement, product: Product | null) {
    let boxes = m.numBoxes ?? 1;
    let strips = m.stripsPerBox ?? 1;
    let tabs = m.tabletsPerStrip ?? 1;
    if (boxes * strips * tabs !== m.quantity && product) {
      const pb = Math.max(1, product.numBoxes ?? 1);
      const ps = Math.max(1, product.stripsPerBox ?? 1);
      const pt = Math.max(1, product.tabletsPerStrip ?? 1);
      if (pb * ps * pt === m.quantity) {
        boxes = pb;
        strips = ps;
        tabs = pt;
      }
    }
    setEmBoxes(String(boxes));
    setEmStrips(String(strips));
    setEmTabs(String(tabs));
    setEmBatch(m.batchNo?.trim() || product?.batchNo?.trim() || '');
    setEmExpiry(formatExpiry(m.expiryDate || product?.expiryDate));
    setEmDealer(m.dealerName?.trim() || product?.dealerName?.trim() || '');
    setEmCost(
      m.costPrice != null && m.costPrice > 0
        ? String(m.costPrice)
        : product?.costPrice != null && product.costPrice > 0
          ? String(product.costPrice)
          : ''
    );
    setEmMrp(
      m.mrp != null && m.mrp > 0
        ? String(m.mrp)
        : product?.mrp != null && product.mrp > 0
          ? String(product.mrp)
          : ''
    );
    setEmSell(
      m.sellingPrice != null && m.sellingPrice > 0
        ? String(m.sellingPrice)
        : product?.sellingPrice != null && product.sellingPrice > 0
          ? String(product.sellingPrice)
          : product?.price != null && product.price > 0
            ? String(product.price)
            : ''
    );
    setEmNotes(m.notes ?? '');
  }

  function openMovementDetail(m: StockMovement) {
    setSelectedMovement(m);
    setSelectedMovementInvoice(m.stockInInvoice ?? null);
    setEditingMovement(false);
    prefillMovementEditForm(m, selected);
    if (m.stockInInvoiceId) {
      api.invoices
        .getStockIn(m.stockInInvoiceId)
        .then((full) => setSelectedMovementInvoice(full))
        .catch(() => undefined);
    }
  }

  async function handleAddStock() {
    if (!selected) return;
    const totalQty = sfTotalUnits;
    if (totalQty <= 0) return;

    setStockSaving(true);
    try {
      const costPrice = parseFloat(sfCost) || undefined;
      const mrp = parseFloat(sfMrp) || undefined;
      const sell = parseFloat(sfSell) || undefined;
      const expiryDate = parseExpiryToIso(sfExpiry.trim()) || undefined;

      const { product } = await api.inventory.stockIn({
        productId: selected.id,
        quantity: totalQty,
        notes: sfNotes.trim() || undefined,
        costPrice,
        dealerName: sfDealer.trim() || undefined,
        batchNo: sfBatch.trim() || undefined,
        expiryDate,
        mrp,
        sellingPrice: sell,
        numBoxes: Math.max(1, parseInt(sfBoxes) || 1),
        stripsPerBox: Math.max(1, parseInt(sfStrips) || 1),
        tabletsPerStrip: Math.max(1, parseInt(sfTabs) || 1),
      });

      setSelected(product);
      setStockFormOpen(false);
      setToast({ message: `Added ${totalQty} units`, type: 'success' });
      load(query, 1);
      loadMovements(selected.id);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to add stock', type: 'error' });
    } finally {
      setStockSaving(false);
    }
  }

  async function handleSaveMovementEdit() {
    if (!selectedMovement || !selected) return;
    setEditSaving(true);
    try {
      const updated = await api.inventory.updateMovement(selectedMovement.id, {
        quantity: emTotalUnits,
        dealerName: emDealer.trim(),
        batchNo: emBatch.trim(),
        expiryDate: parseExpiryToIso(emExpiry.trim()),
        costPrice: parseFloat(emCost) || null,
        mrp: parseFloat(emMrp) || null,
        sellingPrice: parseFloat(emSell) || null,
        numBoxes: Math.max(1, parseInt(emBoxes) || 1),
        stripsPerBox: Math.max(1, parseInt(emStrips) || 1),
        tabletsPerStrip: Math.max(1, parseInt(emTabs) || 1),
        notes: emNotes.trim(),
      });
      setSelectedMovement(updated);
      setEditingMovement(false);
      setToast({ message: 'Movement updated', type: 'success' });
      loadMovements(selected.id);
      load(query, 1);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Update failed', type: 'error' });
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={displayedProducts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.listContent}
        stickyHeaderIndices={[0]}
        refreshing={loading}
        onRefresh={() => load(query, 1)}
        renderItem={({ item: p }) => {
          const status = getStockStatus(p);
          const sell = effectivePrice(p);
          const qty = p.quantityOnHand ?? 0;
          const expirySoon = isExpiringSoon(p.expiryDate);

          return (
            <Pressable key={p.id} onPress={() => openDetail(p)} style={({ pressed }) => [pressed && { opacity: 0.96 }]}>
              <Card style={st.card}>
                <View style={st.cardTopRow}>
                  <Text style={st.cardName} numberOfLines={2}>{p.name}</Text>
                  <Text style={st.cardPrice}>{formatCurrency(sell)}</Text>
                </View>
                <View style={st.cardBottomRow}>
                  <View style={st.cardTagRow}>
                    <View style={[st.statusBadge, { backgroundColor: status.bg }]}>
                      <View style={[st.stockDotSmall, { backgroundColor: status.color }]} />
                      <Text style={[st.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                    </View>
                    {p.category ? (
                      <View style={st.categoryBadge}>
                        <Text style={st.categoryBadgeText}>{p.category}</Text>
                      </View>
                    ) : null}
                    {expirySoon ? (
                      <View style={st.expiryBadge}>
                        <Ionicons name="time-outline" size={12} color={AMBER} />
                        <Text style={st.expiryBadgeText}>Near expiry</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={st.cardStock}>{qty} units</Text>
                </View>
              </Card>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={st.stickyBlock}>
            <View style={st.headerRow}>
              <Text style={st.title}>Products</Text>
            </View>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or barcode"
              style={st.search}
            />
            <View style={st.filterRow}>
              <View style={st.filterLeftCluster}>
                <Pressable
                  style={({ pressed }) => [st.filterBtn, pressed && { opacity: 0.9 }]}
                  onPress={() => setFiltersOpen((prev) => !prev)}>
                  <Ionicons name="options-outline" size={15} color={colors.primary[700]} />
                  <Text style={st.filterBtnText}>Filters</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [st.bulkMiniBtn, pressed && st.btnPressed]} onPress={() => setBulkImportOpen(true)}>
                  <Ionicons name="cloud-upload-outline" size={13} color={colors.textMuted} />
                  <Text style={st.bulkMiniBtnText}>Bulk</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [st.addMiniBtn, pressed && st.btnPressed]} onPress={() => setModalOpen(true)}>
                  <Ionicons name="add" size={13} color={colors.white} />
                  <Text style={st.addMiniBtnText}>Add</Text>
                </Pressable>
              </View>
              <Text style={st.filterHint}>
                {displayedProducts.length}
                {productsTotalPages > 1 ? ` shown (page ${productsPage}/${productsTotalPages})` : ' shown'}
              </Text>
            </View>
            {filtersOpen ? (
              <View style={st.filterPanel}>
                <Text style={st.filterLabel}>Stock</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.inlineChips}>
                  {([
                    ['all', 'All stock'],
                    ['in', 'In stock'],
                    ['low', 'Low stock'],
                    ['out', 'Out of stock'],
                  ] as const).map(([key, label]) => (
                    <Pressable key={key} style={[st.chip, stockFilter === key && st.chipActive]} onPress={() => setStockFilter(key)}>
                      <Text style={[st.chipText, stockFilter === key && st.chipTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={st.filterLabel}>Supplier</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.inlineChips}>
                  {['All suppliers', ...supplierSuggestions].map((supplier) => (
                    <Pressable
                      key={supplier}
                      style={[st.chip, supplierFilter === supplier && st.chipActive]}
                      onPress={() => setSupplierFilter(supplier)}>
                      <Text style={[st.chipText, supplierFilter === supplier && st.chipTextActive]}>{supplier}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={st.toggleRow}>
                  <Pressable style={[st.togglePill, nearExpiryOnly && st.togglePillActive]} onPress={() => setNearExpiryOnly((v) => !v)}>
                    <Ionicons name="time-outline" size={14} color={nearExpiryOnly ? colors.white : AMBER} />
                    <Text style={[st.toggleText, nearExpiryOnly && st.toggleTextActive]}>Near expiry</Text>
                  </Pressable>
                  <Pressable style={[st.togglePill, recentFirst && st.togglePillActive]} onPress={() => setRecentFirst((v) => !v)}>
                    <Ionicons name="sparkles-outline" size={14} color={recentFirst ? colors.white : colors.primary[600]} />
                    <Text style={[st.toggleText, recentFirst && st.toggleTextActive]}>Recent first</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.categoryRow}>
              {categoryOptions.map((category) => (
                <Pressable
                  key={category}
                  style={[st.categoryChip, selectedCategory === category && st.categoryChipActive]}
                  onPress={() => setSelectedCategory(category)}>
                  <Text style={[st.categoryChipText, selectedCategory === category && st.categoryChipTextActive]}>
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListFooterComponent={
          <>
            {productsPage < productsTotalPages ? (
              <Pressable style={st.loadMoreBtn} onPress={() => load(query, productsPage + 1, true)}>
                {loadingMoreProducts ? (
                  <ActivityIndicator size="small" color={colors.primary[600]} />
                ) : (
                  <Text style={st.loadMoreText}>Load more products</Text>
                )}
              </Pressable>
            ) : null}
            {!loading && displayedProducts.length === 0 ? (
              <View style={st.emptyWrap}>
                <Ionicons name="cube-outline" size={48} color={colors.surface[300]} />
                <Text style={st.emptyText}>No products found</Text>
                <Text style={st.emptyHint}>Try a different category or filter</Text>
              </View>
            ) : null}
          </>
        }
      />

      {/* ---- Product Detail Modal ---- */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={closeDetail}>
        <Pressable style={st.backdrop} onPress={closeDetail} />
        <View style={[st.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selected ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={st.dHeader}>
                <View style={st.dHeaderLeft}>
                  <Text style={st.dTitle}>{selected.name}</Text>
                  {selected.category ? (
                    <View style={st.catBadge}>
                      <Text style={st.catBadgeText}>{selected.category}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable onPress={closeDetail} hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Pricing */}
              <View style={st.sec}>
                <Text style={st.secTitle}>PRICING</Text>
                <View style={st.priceGrid}>
                  <PriceCell label="Sell" value={effectivePrice(selected)} />
                  <PriceCell label="MRP" value={selected.mrp ?? 0} />
                  <PriceCell label="Cost" value={selected.costPrice ?? 0} />
                </View>
                {(selected.mrp ?? 0) > 0 && (selected.costPrice ?? 0) > 0 ? (
                  <View style={st.marginChip}>
                    <Text style={st.marginChipText}>
                      Margin: {formatCurrency((selected.mrp ?? 0) - (selected.costPrice ?? 0))} ({(((selected.mrp ?? 0) - (selected.costPrice ?? 0)) / (selected.mrp ?? 1) * 100).toFixed(1)}%)
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Stock */}
              <View style={st.sec}>
                <View style={st.secHeaderRow}>
                  <Text style={st.secTitle}>STOCK</Text>
                  <Pressable style={st.addStockBtn} onPress={() => { setStockFormOpen(!stockFormOpen); if (!stockFormOpen) prefillStockForm(selected); }}>
                    <Ionicons name={stockFormOpen ? 'chevron-up' : 'add'} size={16} color={colors.primary[600]} />
                    <Text style={st.addStockBtnText}>{stockFormOpen ? 'Close' : 'Add Stock'}</Text>
                  </Pressable>
                </View>

                {(() => {
                  const s = getStockStatus(selected);
                  return (
                    <View style={st.stockRow}>
                      <View style={st.stockQtyWrap}>
                        <Text style={[st.stockQtyNum, { color: s.color }]}>{selected.quantityOnHand ?? 0}</Text>
                        <Text style={st.stockQtyUnit}>units</Text>
                      </View>
                      <View style={[st.stockStatusBadge, { backgroundColor: s.bg }]}>
                        <View style={[st.stockDot, { backgroundColor: s.color }]} />
                        <Text style={[st.stockStatusText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    </View>
                  );
                })()}

                {((selected.numBoxes ?? 1) > 1 || (selected.stripsPerBox ?? 1) > 1 || (selected.tabletsPerStrip ?? 1) > 1) ? (
                  <Text style={st.stockBreakdown}>
                    {selected.numBoxes ?? 1} Box x {selected.stripsPerBox ?? 1} Strip x {selected.tabletsPerStrip ?? 1} Tab
                  </Text>
                ) : null}

                {(selected.reorderLevel ?? 0) > 0 ? (
                  <Text style={st.reorderInfo}>Low stock alert at {selected.reorderLevel} units</Text>
                ) : null}

                {/* Add Stock Form */}
                {stockFormOpen ? (
                  <View style={st.stockForm}>
                    <Text style={st.sfLabel}>QUANTITY</Text>
                    <View style={st.pkgLabelRow}>
                      <Text style={st.pkgLabel}>Boxes</Text>
                      <Text style={st.pkgLabel}>Strips in 1 Box</Text>
                      <Text style={st.pkgLabel}>Tablets in 1 Strip</Text>
                    </View>
                    <View style={st.sfRow3}>
                      <View style={st.sfCol}><Input value={sfBoxes} onChangeText={setSfBoxes} keyboardType="numeric" placeholder="1" /></View>
                      <View style={st.sfCol}><Input value={sfStrips} onChangeText={setSfStrips} keyboardType="numeric" placeholder="1" /></View>
                      <View style={st.sfCol}><Input value={sfTabs} onChangeText={setSfTabs} keyboardType="numeric" placeholder="1" /></View>
                    </View>
                    <Text style={st.sfTotal}>Total: {sfTotalUnits} units</Text>

                    <Text style={st.sfLabel}>PRICING</Text>
                    <View style={st.sfRow3}>
                      <View style={st.sfCol}><Input label="MRP /Strip" value={sfMrp} onChangeText={(v) => { setSfMrp(v); if (!sfSell || sfSell === sfMrp) setSfSell(v); }} keyboardType="decimal-pad" placeholder="100" /></View>
                      <View style={st.sfCol}><Input label="Sell /Strip" value={sfSell} onChangeText={setSfSell} keyboardType="decimal-pad" placeholder="95" /></View>
                      <View style={st.sfCol}><Input label="Cost /Strip" value={sfCost} onChangeText={setSfCost} keyboardType="decimal-pad" placeholder="87.80" /></View>
                    </View>

                    {parseFloat(sfSell) > 0 && parseFloat(sfMrp) > 0 && parseFloat(sfSell) > parseFloat(sfMrp) ? (
                      <View style={st.warnBox}><Text style={st.warnBoxText}>⚠ Selling price is higher than MRP</Text></View>
                    ) : null}

                    <View style={st.sfRow2}>
                      <View style={st.sfCol}><Input label="Batch" value={sfBatch} onChangeText={setSfBatch} placeholder="Batch" /></View>
                      <View style={st.sfCol}><Input label="Expiry" value={sfExpiry} onChangeText={setSfExpiry} placeholder="MM/YYYY" /></View>
                    </View>

                    <Input label="Dealer" value={sfDealer} onChangeText={setSfDealer} placeholder="Dealer name" />
                    <Input label="Notes" value={sfNotes} onChangeText={setSfNotes} placeholder="Optional notes" />

                    <Button
                      title={`Add ${sfTotalUnits} units`}
                      onPress={handleAddStock}
                      loading={stockSaving}
                      disabled={sfTotalUnits <= 0}
                    />
                  </View>
                ) : null}
              </View>

              {/* Details */}
              <View style={st.sec}>
                <Text style={st.secTitle}>DETAILS</Text>
                {(latestStockIn?.batchNo || selected.batchNo) ? <DetailRow label="Batch" value={latestStockIn?.batchNo || selected.batchNo || ''} /> : null}
                {(() => {
                  const expiry = latestStockIn?.expiryDate || selected.expiryDate;
                  if (!expiry) return null;
                  return (
                    <DetailRow
                      label="Expiry"
                      value={formatExpiry(expiry)}
                      valueColor={isExpired(expiry) ? colors.danger : isExpiringSoon(expiry) ? AMBER : undefined}
                    />
                  );
                })()}
                {(latestStockIn?.dealerName || selected.dealerName) ? <DetailRow label="Dealer" value={latestStockIn?.dealerName || selected.dealerName || ''} /> : null}
                <DetailRow label="Barcode" value={selected.barcode} />
              </View>

              {/* History */}
              <View style={st.sec}>
                <Text style={st.secTitle}>HISTORY</Text>
                <View style={st.histFilter}>
                  {([['all', 'All'], ['in', 'Stock In'], ['out', 'Stock Out']] as const).map(([key, label]) => (
                    <Pressable key={key} onPress={() => setHistoryFilter(key)} style={[st.histFilterPill, historyFilter === key && st.histFilterPillActive]}>
                      <Text style={[st.histFilterText, historyFilter === key && st.histFilterTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {movementsLoading ? (
                  <ActivityIndicator size="small" color={colors.primary[600]} style={{ paddingVertical: spacing.md }} />
                ) : historyError ? (
                  <Text style={st.historyError}>{historyError}</Text>
                ) : filteredMovements.length === 0 ? (
                  <Text style={st.noHistory}>No {historyFilter === 'all' ? '' : historyFilter === 'in' ? 'stock in ' : 'stock out '}history</Text>
                ) : (
                  <>
                    {filteredMovements.map((m) => {
                      const meta = MOVEMENT_META[m.type] ?? { label: m.type, icon: 'ellipse-outline', color: colors.textMuted };
                      const dateStr = m.date ? new Date(m.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
                      return (
                        <Pressable key={m.id} onPress={() => openMovementDetail(m)}>
                          <View style={st.histRow}>
                            <Ionicons name={meta.icon as any} size={18} color={meta.color} style={st.histIcon} />
                            <View style={st.histInfo}>
                              <Text style={st.histType}>{meta.label}</Text>
                              <Text style={st.histDate}>{dateStr}{m.notes ? ` · ${m.notes}` : ''}</Text>
                            </View>
                            <View style={st.histRight}>
                              <Text style={[st.histQty, { color: meta.color }]}>
                                {m.type === 'SALE' || m.type === 'ADJUSTMENT' ? '-' : '+'}{m.quantity}
                              </Text>
                              <Text style={st.histBal}>Bal: {m.balanceAfter}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.surface[300]} style={{ marginLeft: 4 }} />
                          </View>
                        </Pressable>
                      );
                    })}
                    {movementsPage < movementsTotalPages ? (
                      <Pressable style={st.loadMoreBtn} onPress={() => selected && loadMovements(selected.id, movementsPage + 1, true)}>
                        {movementsLoadingMore ? (
                          <ActivityIndicator size="small" color={colors.primary[600]} />
                        ) : (
                          <Text style={st.loadMoreText}>Load more</Text>
                        )}
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {/* ---- Movement Detail Modal ---- */}
      <Modal visible={!!selectedMovement} animationType="slide" transparent onRequestClose={() => setSelectedMovement(null)}>
        <Pressable style={st.backdrop} onPress={() => { setSelectedMovement(null); setSelectedMovementInvoice(null); setEditingMovement(false); }} />
        <View style={[st.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selectedMovement ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={st.dHeader}>
                <View style={st.dHeaderLeft}>
                  <Text style={st.dTitle}>
                    {(MOVEMENT_META[selectedMovement.type]?.label ?? selectedMovement.type)}
                  </Text>
                  <Text style={st.movementDate}>
                    {new Date(selectedMovement.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
                <View style={st.movementHeaderRight}>
                  {(selectedMovement.type === 'STOCK_IN' || selectedMovement.type === 'OPENING') && !editingMovement ? (
                    <Pressable
                      style={st.editBtn}
                      onPress={() => {
                        if (selectedMovement) prefillMovementEditForm(selectedMovement, selected);
                        setEditingMovement(true);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.primary[600]} />
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => { setSelectedMovement(null); setSelectedMovementInvoice(null); setEditingMovement(false); }} hitSlop={12}>
                    <Ionicons name="close" size={24} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>

              {editingMovement ? (
                /* ---- Edit Mode ---- */
                <View>
                  <View style={st.sec}>
                    <Text style={st.secTitle}>QUANTITY</Text>
                    <View style={st.pkgLabelRow}>
                      <Text style={st.pkgLabel}>Boxes</Text>
                      <Text style={st.pkgLabel}>Strips in 1 Box</Text>
                      <Text style={st.pkgLabel}>Tablets in 1 Strip</Text>
                    </View>
                    <View style={st.sfRow3}>
                      <View style={st.sfCol}><Input value={emBoxes} onChangeText={setEmBoxes} keyboardType="numeric" placeholder="1" /></View>
                      <View style={st.sfCol}><Input value={emStrips} onChangeText={setEmStrips} keyboardType="numeric" placeholder="1" /></View>
                      <View style={st.sfCol}><Input value={emTabs} onChangeText={setEmTabs} keyboardType="numeric" placeholder="1" /></View>
                    </View>
                    <Text style={st.sfTotal}>Total: {emTotalUnits} units</Text>
                  </View>

                  <View style={st.sec}>
                    <Text style={st.secTitle}>PRICING</Text>
                    <View style={st.sfRow3}>
                      <View style={st.sfCol}><Input label="MRP /Strip" value={emMrp} onChangeText={setEmMrp} keyboardType="decimal-pad" placeholder="100" /></View>
                      <View style={st.sfCol}><Input label="Sell /Strip" value={emSell} onChangeText={setEmSell} keyboardType="decimal-pad" placeholder="95" /></View>
                      <View style={st.sfCol}><Input label="Cost /Strip" value={emCost} onChangeText={setEmCost} keyboardType="decimal-pad" placeholder="87.80" /></View>
                    </View>
                    {parseFloat(emSell) > 0 && parseFloat(emMrp) > 0 && parseFloat(emSell) > parseFloat(emMrp) ? (
                      <View style={st.warnBox}><Text style={st.warnBoxText}>⚠ Selling price is higher than MRP</Text></View>
                    ) : null}
                  </View>

                  <View style={st.sec}>
                    <Text style={st.secTitle}>DETAILS</Text>
                    <View style={st.sfRow2}>
                      <View style={st.sfCol}><Input label="Batch" value={emBatch} onChangeText={setEmBatch} placeholder="Batch" /></View>
                      <View style={st.sfCol}><Input label="Expiry" value={emExpiry} onChangeText={setEmExpiry} placeholder="MM/YYYY" /></View>
                    </View>
                    <Input label="Dealer" value={emDealer} onChangeText={setEmDealer} placeholder="Dealer name" />
                    <Input label="Notes" value={emNotes} onChangeText={setEmNotes} placeholder="Notes" />
                  </View>

                  <View style={st.editBtnRow}>
                    <Button title="Cancel" variant="secondary" onPress={() => setEditingMovement(false)} style={{ flex: 1 }} />
                    <Button title="Save" onPress={handleSaveMovementEdit} loading={editSaving} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                /* ---- View Mode ---- */
                <View>
                  {/* Quantity */}
                  <View style={st.sec}>
                    <Text style={st.secTitle}>QUANTITY</Text>
                    <View style={st.stockRow}>
                      <View style={st.stockQtyWrap}>
                        <Text style={[st.stockQtyNum, { color: (MOVEMENT_META[selectedMovement.type]?.color ?? colors.text) }]}>
                          {selectedMovement.type === 'SALE' ? '-' : '+'}{selectedMovement.quantity}
                        </Text>
                        <Text style={st.stockQtyUnit}>units</Text>
                      </View>
                      <Text style={st.histBalLarge}>Balance: {selectedMovement.balanceAfter}</Text>
                    </View>
                    {((selectedMovement.numBoxes ?? 1) > 1 || (selectedMovement.stripsPerBox ?? 1) > 1 || (selectedMovement.tabletsPerStrip ?? 1) > 1) ? (
                      <Text style={st.stockBreakdown}>
                        {selectedMovement.numBoxes ?? 1} Box x {selectedMovement.stripsPerBox ?? 1} Strip x {selectedMovement.tabletsPerStrip ?? 1} Tab
                      </Text>
                    ) : null}
                  </View>

                  {/* Pricing */}
                  {(selectedMovement.type === 'STOCK_IN' || selectedMovement.type === 'OPENING') && ((selectedMovement.sellingPrice ?? 0) > 0 || (selectedMovement.mrp ?? 0) > 0 || (selectedMovement.costPrice ?? 0) > 0) ? (
                    <View style={st.sec}>
                      <Text style={st.secTitle}>PRICING</Text>
                      <View style={st.priceGrid}>
                        <PriceCell label="Sell" value={selectedMovement.sellingPrice ?? 0} />
                        <PriceCell label="MRP" value={selectedMovement.mrp ?? 0} />
                        <PriceCell label="Cost" value={selectedMovement.costPrice ?? 0} />
                      </View>
                    </View>
                  ) : null}

                  {/* Details */}
                  <View style={st.sec}>
                    <Text style={st.secTitle}>DETAILS</Text>
                    {selectedMovement.batchNo ? <DetailRow label="Batch" value={selectedMovement.batchNo} /> : null}
                    {selectedMovement.expiryDate ? (
                      <DetailRow
                        label="Expiry"
                        value={formatExpiry(selectedMovement.expiryDate)}
                        valueColor={isExpired(selectedMovement.expiryDate) ? colors.danger : isExpiringSoon(selectedMovement.expiryDate) ? AMBER : undefined}
                      />
                    ) : null}
                    {selectedMovement.dealerName ? <DetailRow label="Dealer" value={selectedMovement.dealerName} /> : null}
                    {selectedMovement.notes ? <DetailRow label="Notes" value={selectedMovement.notes} /> : null}
                    {selectedMovement.createdByName ? <DetailRow label="By" value={selectedMovement.createdByName} /> : null}
                  </View>

                  {selectedMovementInvoice ? (
                    <View style={st.sec}>
                      <Text style={st.secTitle}>STOCK-IN INVOICE</Text>
                      {selectedMovementInvoice.invoiceNumber ? (
                        <DetailRow label="Invoice #" value={selectedMovementInvoice.invoiceNumber} />
                      ) : null}
                      {selectedMovementInvoice.invoiceDate ? (
                        <DetailRow
                          label="Date"
                          value={new Date(selectedMovementInvoice.invoiceDate).toLocaleDateString('en-IN')}
                        />
                      ) : null}
                      {selectedMovementInvoice.supplierName ? (
                        <DetailRow label="Supplier" value={selectedMovementInvoice.supplierName} />
                      ) : null}
                      {selectedMovementInvoice.supplierGst || selectedMovementInvoice.supplierGstNumber ? (
                        <DetailRow
                          label="GST"
                          value={
                            selectedMovementInvoice.supplierGst ||
                            selectedMovementInvoice.supplierGstNumber ||
                            ''
                          }
                        />
                      ) : null}
                      {selectedMovementInvoice.supplierDrugLicenseNumber ? (
                        <DetailRow
                          label="Drug Lic"
                          value={selectedMovementInvoice.supplierDrugLicenseNumber}
                        />
                      ) : null}
                      {selectedMovementInvoice.invoiceTotal != null ? (
                        <DetailRow label="Total" value={formatCurrency(selectedMovementInvoice.invoiceTotal)} />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <AddProductSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        autoGenerateBarcode
        categorySuggestions={categorySuggestions}
        onSaved={() => {
          setToast({ message: 'Product added', type: 'success' });
          load(query, 1);
        }}
      />

      <BulkImportSheet
        visible={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onSaved={() => {
          setToast({ message: 'Products imported', type: 'success' });
          load(query, 1);
        }}
      />

      {toast ? (
        <Toast visible={!!toast} message={toast.message} type={toast.type} onHide={() => setToast(null)} />
      ) : null}
    </Screen>
  );
}

function PriceCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={st.priceCell}>
      <Text style={st.priceCellLabel}>{label}</Text>
      <Text style={st.priceCellValue}>{value > 0 ? formatCurrency(value) : '—'}</Text>
    </View>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={st.detailItem}>
      <Text style={st.detailLabel}>{label}</Text>
      <Text style={[st.detailValue, valueColor ? { color: valueColor } : undefined]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  stickyBlock: {
    backgroundColor: colors.surface[50],
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontFamily: font.bold, fontSize: 26, color: colors.text },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  search: { marginBottom: spacing.sm },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  filterLeftCluster: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, marginRight: spacing.sm },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  filterBtnText: { fontFamily: font.semiBold, fontSize: 12, color: colors.primary[700] },
  bulkMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.surface[200],
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  bulkMiniBtnText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  addMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[600],
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  addMiniBtnText: { fontFamily: font.semiBold, fontSize: 12, color: colors.white },
  filterHint: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  filterPanel: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface[200],
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterLabel: {
    fontFamily: font.semiBold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
    letterSpacing: 0.6,
  },
  inlineChips: { gap: spacing.xs, paddingBottom: spacing.xs },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface[100],
  },
  chipActive: { backgroundColor: colors.primary[600] },
  chipText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  chipTextActive: { color: colors.white },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface[100],
  },
  togglePillActive: { backgroundColor: colors.primary[600] },
  toggleText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  toggleTextActive: { color: colors.white },
  categoryRow: { gap: spacing.xs },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.surface[200],
  },
  categoryChipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  categoryChipText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  categoryChipTextActive: { color: colors.white },

  // Cards
  card: { marginBottom: spacing.sm, borderRadius: radius.lg, paddingVertical: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  cardTagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, marginRight: spacing.sm, flexWrap: 'wrap' },
  cardName: { fontFamily: font.semiBold, fontSize: 16, color: colors.text, flex: 1 },
  stockDotSmall: { width: 7, height: 7, borderRadius: 4 },
  cardStock: { fontFamily: font.semiBold, fontSize: 13, color: colors.textMuted },
  cardPrice: { fontFamily: font.bold, fontSize: 20, color: colors.primary[700] },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  statusBadgeText: { fontFamily: font.semiBold, fontSize: 11 },
  categoryBadge: { backgroundColor: colors.surface[100], paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  categoryBadgeText: { fontFamily: font.medium, fontSize: 11, color: colors.textMuted },
  expiryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: AMBER_BG, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  expiryBadgeText: { fontFamily: font.medium, fontSize: 11, color: '#b45309' },

  // Empty
  emptyWrap: { alignItems: 'center', marginTop: spacing.xl * 2, gap: spacing.sm },
  emptyText: { fontFamily: font.semiBold, fontSize: 16, color: colors.textMuted },
  emptyHint: { fontFamily: font.regular, fontSize: 13, color: colors.surface[300] },

  // Modal
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '92%' },

  // Detail header
  dHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  dHeaderLeft: { flex: 1, marginRight: spacing.md },
  dTitle: { fontFamily: font.bold, fontSize: 20, color: colors.text, lineHeight: 26 },
  catBadge: { alignSelf: 'flex-start', backgroundColor: colors.primary[50], paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 6 },
  catBadgeText: { fontFamily: font.medium, fontSize: 12, color: colors.primary[700] },
  movementDate: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 4 },
  movementHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editBtn: { padding: 6, backgroundColor: colors.primary[50], borderRadius: 8 },

  // Sections
  sec: { backgroundColor: colors.surface[50], borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  secTitle: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm },
  secHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },

  // Pricing grid
  priceGrid: { flexDirection: 'row', gap: spacing.sm },
  priceCell: { flex: 1, backgroundColor: colors.white, borderRadius: 8, padding: spacing.sm, alignItems: 'center' },
  priceCellLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  priceCellValue: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  marginChip: { alignSelf: 'flex-start', backgroundColor: GREEN_BG, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: spacing.sm },
  marginChipText: { fontFamily: font.medium, fontSize: 12, color: colors.success },

  // Stock section
  addStockBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary[50], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addStockBtnText: { fontFamily: font.semiBold, fontSize: 13, color: colors.primary[600] },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  stockQtyWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  stockQtyNum: { fontFamily: font.bold, fontSize: 32 },
  stockQtyUnit: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted },
  stockStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  stockDot: { width: 8, height: 8, borderRadius: 4 },
  stockStatusText: { fontFamily: font.semiBold, fontSize: 12 },
  stockBreakdown: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  reorderInfo: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },

  // Stock form
  stockForm: { backgroundColor: colors.white, borderRadius: 8, padding: spacing.sm, marginTop: spacing.sm },
  sfLabel: { fontFamily: font.semiBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginBottom: 4, marginTop: spacing.sm },
  sfRow3: { flexDirection: 'row', gap: spacing.sm },
  sfRow2: { flexDirection: 'row', gap: spacing.sm },
  sfCol: { flex: 1 },
  sfTotal: { fontFamily: font.medium, fontSize: 12, color: colors.primary[700], backgroundColor: colors.primary[50], paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6, marginBottom: spacing.xs, overflow: 'hidden' },
  pkgLabelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 4 },
  pkgLabel: { flex: 1, fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  warnBox: { backgroundColor: '#fffbeb', borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.xs },
  warnBoxText: { fontFamily: font.medium, fontSize: 12, color: '#b45309' },

  // Detail items
  detailItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted, width: 60 },
  detailValue: { flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.text, textAlign: 'right' },

  // History
  histFilter: { flexDirection: 'row', backgroundColor: colors.surface[100], borderRadius: 8, padding: 2, marginBottom: spacing.sm },
  histFilterPill: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  histFilterPillActive: { backgroundColor: colors.primary[600] },
  histFilterText: { fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted },
  histFilterTextActive: { color: colors.white },
  noHistory: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  historyError: { fontFamily: font.medium, fontSize: 13, color: colors.danger, textAlign: 'center', paddingVertical: spacing.md },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 12, marginTop: spacing.xs },
  loadMoreText: { fontFamily: font.semiBold, fontSize: 14, color: colors.primary[600] },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  histIcon: { marginRight: 10, width: 20 },
  histInfo: { flex: 1 },
  histType: { fontFamily: font.semiBold, fontSize: 13, color: colors.text },
  histDate: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  histRight: { alignItems: 'flex-end', marginRight: 2 },
  histQty: { fontFamily: font.bold, fontSize: 14 },
  histBal: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  histBalLarge: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted },

  // Edit buttons
  editBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
