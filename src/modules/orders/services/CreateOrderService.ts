import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const findCustomerWithId = await this.customersRepository.findById(
      customer_id,
    );

    if (!findCustomerWithId) {
      throw new AppError('Invalid customer_id');
    }

    const findProducts = await this.productsRepository.findAllById(products);

    if (!findProducts.length) {
      throw new AppError('No product found with the provided ids');
    }

    const findProductsIds = findProducts.map(product => product.id);

    const checkNotFoundProduct = products.filter(
      product => !findProductsIds.includes(product.id),
    );

    if (checkNotFoundProduct.length) {
      throw new AppError(
        `No product found with the ids ${checkNotFoundProduct.join(',')}`,
      );
    }

    const findProductsWithInsufficientQuantity = products.filter(product => {
      const fProduct = findProducts.find(prod => prod.id === product.id);
      if (!fProduct) return true;
      return fProduct.quantity < product.quantity;
    });

    if (findProductsWithInsufficientQuantity.length) {
      throw new AppError(
        `Insufficient quantity for products ${findProductsWithInsufficientQuantity
          .map(product => product.id)
          .join(',')}`,
      );
    }

    const productsToCreate = products.map(product => {
      const fProduct = findProducts.find(
        fProduct => fProduct.id === product.id,
      );
      const price = fProduct ? fProduct.price : 0;
      return {
        product_id: product.id,
        quantity: product.quantity,
        price,
      };
    });

    const order = await this.ordersRepository.create({
      customer: findCustomerWithId,
      products: productsToCreate,
    });

    const orderProductsQuantity = products.map(product => {
      const fProduct = findProducts.find(
        fProduct => fProduct.id === product.id,
      );
      const quantity = fProduct ? fProduct.quantity - product.quantity : 0;
      return {
        id: product.id,
        quantity,
      };
    });

    await this.productsRepository.updateQuantity(orderProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
