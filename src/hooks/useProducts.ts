import { useState, useCallback } from 'react';
import { collection, getDocs, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export type ProductItem = {
  id: string;
  itemCode: string;
  name: string;
  size: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
};

export function useProducts() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async (): Promise<QuerySnapshot<DocumentData, DocumentData>> => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'products'));
      
      const fetchedProducts: ProductItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isActive !== false) {
          fetchedProducts.push({
            id: doc.id,
            itemCode: data.item_code ?? '',
            name: data.name ?? '',
            size: data.size ?? '',
            purchasePrice: Number(data.purchase_price) || 0,
            sellingPrice: Number(data.price) || 0,
            stock: Number(data.stock) || 0,
          });
        }
      });

      setProducts(fetchedProducts);
      return querySnapshot;
    } catch (error) {
      console.error('[useProducts] Error fetching products:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    products,
    loading,
    fetchProducts,
    setProducts,
    setLoading,
  };
}
